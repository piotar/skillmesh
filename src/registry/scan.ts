/** Scan a project's skills directory for installed skills (managed and project-local). */

import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { installedSkillDir } from "../config/paths";
import { linkStatus, type LinkStatus } from "../link/link";
import { isDirectory } from "../util/fs";

/** A skill directory found in the project. */
export type InstalledSkill = {
  name: string;
  path: string;
  /** True when the skill is skillmesh-managed: present in the lockfile, or installed as a link
   *  (a junction into the store — a hand-authored skill is always a plain directory). */
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
 *
 * `managedNames` (the lockfile's skill names) is the source of truth for the `managed` flag; a skill
 * installed as a link is also treated as managed so `doctor` can still flag store-linked-but-unlocked
 * skills without an in-tree marker.
 */
export async function scanInstalled(
  projectPath: string,
  skillsDirs: string[],
  managedNames: Set<string> = new Set(),
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
        return { path, status: await linkStatus(path) };
      }),
    );
    const present = perDir.filter((d) => d.status !== "missing");
    const path = (present[0] ?? perDir[0])?.path;
    if (!path) continue; // unreachable: the name came from one of the scanned dirs
    found.push({
      name,
      path,
      managed: managedNames.has(name) || perDir.some((d) => d.status === "link"),
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
