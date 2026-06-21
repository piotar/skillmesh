/**
 * Read/write a project's config and lockfile.
 * Both are stored in the global home (keyed by project path), never in the project itself.
 */

import { defaults } from "../constants";
import type { Lockfile, ProjectConfig } from "../types";
import { readJson, writeJson } from "../util/fs";
import { lockfilePath, projectConfigPath, projectRootLockPath } from "./paths";

/** An empty lockfile. */
function emptyLockfile(): Lockfile {
  return { version: 1, skills: [] };
}

/** The configuration applied to a freshly initialized project. */
export function defaultProjectConfig(): ProjectConfig {
  return {
    version: 1,
    skillsDirs: [...defaults.skillsDirs],
    defaultMode: defaults.mode,
    projectLock: false,
    syncImports: true,
  };
}

/** A config as persisted, possibly predating the `skillsDir` → `skillsDirs` change. */
type StoredConfig = ProjectConfig & { skillsDir?: string };

/** Coerce a stored config forward: a legacy single `skillsDir` becomes a one-element `skillsDirs`. */
function migrateConfig(raw: StoredConfig): ProjectConfig {
  const skillsDirs = raw.skillsDirs?.length
    ? raw.skillsDirs
    : raw.skillsDir
      ? [raw.skillsDir]
      : [...defaults.skillsDirs];
  const { skillsDir: _legacy, ...rest } = raw;
  return { ...rest, skillsDirs };
}

/** Read a project's config from home, or null when the project is not initialized. */
export async function readProjectConfig(
  projectPath: string,
  home?: string,
): Promise<ProjectConfig | null> {
  const raw = await readJson<StoredConfig>(projectConfigPath(projectPath, home));
  return raw ? migrateConfig(raw) : null;
}

/** Persist a project's config to home. */
export async function writeProjectConfig(
  projectPath: string,
  config: ProjectConfig,
  home?: string,
): Promise<void> {
  await writeJson(projectConfigPath(projectPath, home), config);
}

/** Whether a project has been initialized (its config exists in home). */
export async function isInitialized(projectPath: string, home?: string): Promise<boolean> {
  return (await readProjectConfig(projectPath, home)) !== null;
}

/** Read the home (local) lockfile, returning an empty lockfile when absent. */
export async function readLockfile(projectPath: string, home?: string): Promise<Lockfile> {
  return (await readJson<Lockfile>(lockfilePath(projectPath, home))) ?? emptyLockfile();
}

/** Persist the home (local) lockfile. */
export async function writeLockfile(
  projectPath: string,
  lockfile: Lockfile,
  home?: string,
): Promise<void> {
  await writeJson(lockfilePath(projectPath, home), lockfile);
}

/** Read the opt-in committed project-root lockfile, or null when it does not exist. */
export async function readProjectLock(projectPath: string): Promise<Lockfile | null> {
  return readJson<Lockfile>(projectRootLockPath(projectPath));
}

/** Persist the opt-in committed project-root lockfile. */
export async function writeProjectLock(projectPath: string, lockfile: Lockfile): Promise<void> {
  await writeJson(projectRootLockPath(projectPath), lockfile);
}

/**
 * Merge two lockfiles into the effective set, keyed by skill name.
 * The committed project lock is the shared source of truth: on a name conflict it wins,
 * while the home lock contributes any skills that are local-only. Output is sorted for determinism.
 */
export function mergeLocks(project: Lockfile | null, home: Lockfile): Lockfile {
  const byName = new Map<string, Lockfile["skills"][number]>();
  for (const entry of home.skills) byName.set(entry.name, entry); // local-only baseline
  for (const entry of project?.skills ?? []) byName.set(entry.name, entry); // project overrides
  const skills = [...byName.values()].sort((a, b) => a.name.localeCompare(b.name));
  return { version: 1, skills };
}

/** Read the effective lockfile for a project (committed project lock merged over home lock). */
export async function readEffectiveLockfile(projectPath: string, home?: string): Promise<Lockfile> {
  const [projectLock, homeLock] = await Promise.all([
    readProjectLock(projectPath),
    readLockfile(projectPath, home),
  ]);
  return mergeLocks(projectLock, homeLock);
}
