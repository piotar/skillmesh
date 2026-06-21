/** Scan a project's skills directory for installed skills (managed and project-local). */

import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { installedSkillDir } from "../config/paths";
import { linkStatus, type LinkStatus } from "../link/link";
import { isManaged } from "../manifest/manifest";
import { isDirectory } from "../util/fs";

/** A skill directory found in the project. */
export type InstalledSkill = {
  name: string;
  path: string;
  /** True when a sidecar manifest is present (skillmesh-managed). */
  managed: boolean;
  status: LinkStatus;
};

/** Pick the most "present" status across the dirs a skill was mirrored into. */
function bestStatus(statuses: LinkStatus[]): LinkStatus {
  if (statuses.includes("link")) return "link";
  if (statuses.includes("dir")) return "dir";
  if (statuses.includes("broken")) return "broken";
  return "missing";
}

/**
 * List the skills present across all of the project's skills directories, one row per unique name.
 * Because a managed skill is mirrored into every configured dir, entries are merged by name: the
 * status is the best (most present) across dirs, and `path` points at the first dir that has it.
 */
export async function scanInstalled(
  projectPath: string,
  skillsDirs: string[],
): Promise<InstalledSkill[]> {
  // First gather the candidate names from every configured directory.
  const names = new Set<string>();
  for (const skillsDir of skillsDirs) {
    const root = join(projectPath, skillsDir);
    if (!(await isDirectory(root))) continue;
    for (const entry of await readdir(root, { withFileTypes: true })) {
      // Linked skills surface as symbolic links (junctions on Windows), copies as directories.
      if (entry.isDirectory() || entry.isSymbolicLink()) names.add(entry.name);
    }
  }

  const found: InstalledSkill[] = [];
  for (const name of names) {
    const perDir = await Promise.all(
      skillsDirs.map(async (skillsDir) => {
        const path = installedSkillDir(projectPath, skillsDir, name);
        return { path, status: await linkStatus(path), managed: await isManaged(path) };
      }),
    );
    const present = perDir.filter((d) => d.status !== "missing");
    const path = (present[0] ?? perDir[0])?.path;
    if (!path) continue; // unreachable: the name came from one of the scanned dirs
    found.push({
      name,
      path,
      managed: present.some((d) => d.managed),
      status: bestStatus(perDir.map((d) => d.status)),
    });
  }
  return found.sort((a, b) => a.name.localeCompare(b.name));
}

/** The set of skill names currently present in any of the project's dirs (for conflict detection). */
export async function installedNames(
  projectPath: string,
  skillsDirs: string[],
): Promise<Set<string>> {
  const skills = await scanInstalled(projectPath, skillsDirs);
  return new Set(skills.map((s) => s.name));
}
