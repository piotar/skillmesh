/**
 * Read-only discovery data for the MCP server: the catalog an agent can browse (skills installed in
 * the active project, skills cached in the global store, and presets) plus a skill's full SKILL.md.
 *
 * Kept free of any MCP/transport concerns so it can be unit-tested headlessly — `server.ts` is a thin
 * wrapper that exposes these functions as MCP tools/resources. Everything here is strictly read-only:
 * nothing is fetched, installed or mutated.
 */

import { join } from "node:path";
import { files } from "../constants";
import { resolveActiveProject } from "../config/global";
import { readProjectConfig } from "../config/project";
import { describeSource } from "../cli/describeSource";
import { listSkills } from "../registry/registry";
import { scanInstalled } from "../registry/scan";
import { listPresets } from "../preset/preset";
import { parseSkillMd } from "../skill/frontmatter";
import { getStoreSkill, latestPerName, listStoreEntries } from "../store/store";
import { readText } from "../util/fs";

/** Appended to install-relevant results: this server never installs, and installs need a fresh session. */
export const installHint =
  "This server is read-only and does not install anything. To install, run `skillmesh add <source>` " +
  "in a terminal; the skill becomes active after the agent's next session starts.";

/** A skill installed in the active project. */
export type InstalledSkillInfo = {
  name: string;
  kind: "managed" | "local";
  status: string;
  version?: string;
  mode?: string;
  source?: string;
};

/** A skill cached in the global store, available to install. */
export type AvailableSkillInfo = {
  name: string;
  version: string;
  description?: string;
  source?: string;
};

/** A named set of skill sources. */
export type PresetInfo = {
  name: string;
  sources: string[];
};

/** The full SKILL.md of a single skill, with parsed frontmatter. */
export type SkillContent = {
  name: string;
  version?: string;
  scope: "store" | "project";
  description?: string;
  content: string;
};

/** List skills installed in the active project (managed + project-local), for context. */
export async function listInstalledSkills(home?: string): Promise<InstalledSkillInfo[]> {
  const projectPath = await resolveActiveProject(home ? { home } : {});
  const skills = await listSkills({ projectPath, ...(home ? { home } : {}) });
  return skills.map((s) => ({
    name: s.name,
    kind: s.kind,
    status: s.status,
    ...(s.version ? { version: s.version } : {}),
    ...(s.mode ? { mode: s.mode } : {}),
    ...(s.source ? { source: describeSource(s.source) } : {}),
  }));
}

/**
 * List skills cached in the global store ("what can I install"), one entry per name (latest version),
 * optionally filtered by a case-insensitive substring matched against name and description.
 */
export async function listAvailableSkills(
  query?: string,
  home?: string,
): Promise<AvailableSkillInfo[]> {
  const entries = latestPerName(await listStoreEntries(home));
  const needle = query?.trim().toLowerCase();
  const filtered = needle
    ? entries.filter(
        (e) =>
          e.name.toLowerCase().includes(needle) ||
          (e.description?.toLowerCase().includes(needle) ?? false),
      )
    : entries;
  return filtered.map((e) => ({
    name: e.name,
    version: e.version,
    ...(e.description ? { description: e.description } : {}),
    ...(e.source ? { source: describeSource(e.source) } : {}),
  }));
}

/** List presets (named sets of skill sources) with each source rendered as a short origin string. */
export async function listPresetsInfo(home?: string): Promise<PresetInfo[]> {
  const presets = await listPresets(home);
  return presets.map((p) => ({ name: p.name, sources: p.sources.map(describeSource) }));
}

/** Resolve the latest cached version for a store skill name, or null when none is cached. */
async function latestStoreVersion(name: string, home?: string): Promise<string | null> {
  const latest = latestPerName(await listStoreEntries(home)).find((e) => e.name === name);
  return latest?.version ?? null;
}

/** Read a skill's SKILL.md from the global store at a given (or latest) version. */
async function readFromStore(
  name: string,
  version: string | undefined,
  home?: string,
): Promise<SkillContent | null> {
  const resolved = version ?? (await latestStoreVersion(name, home));
  if (!resolved) return null;
  const entry = await getStoreSkill(name, resolved, home);
  if (!entry) return null;
  const content = await readText(join(entry.path, files.skill));
  return {
    name,
    version: resolved,
    scope: "store",
    description: parseSkillMd(content).frontmatter.description,
    content,
  };
}

/** Read a skill's SKILL.md from the active project's installed skills. */
async function readFromProject(name: string, home?: string): Promise<SkillContent | null> {
  const projectPath = await resolveActiveProject(home ? { home } : {});
  const config = await readProjectConfig(projectPath, home);
  if (!config) return null;
  const skill = (await scanInstalled(projectPath, config.skillsDirs)).find((s) => s.name === name);
  if (!skill || skill.status === "broken" || skill.status === "missing") return null;
  const content = await readText(join(skill.path, files.skill));
  return {
    name,
    scope: "project",
    description: parseSkillMd(content).frontmatter.description,
    content,
  };
}

/**
 * Read the full SKILL.md of a skill so an agent can inspect it before a human installs it.
 * `scope` "store" (default) reads the cached version (latest unless `version` is given), falling back
 * to the project copy; "project" reads only the installed copy. Returns null when not found anywhere.
 */
export async function readSkill(
  opts: { name: string; version?: string; scope?: "store" | "project" },
  home?: string,
): Promise<SkillContent | null> {
  const scope = opts.scope ?? "store";
  if (scope === "project") return readFromProject(opts.name, home);
  return (
    (await readFromStore(opts.name, opts.version, home)) ??
    (await readFromProject(opts.name, home))
  );
}
