/**
 * Path resolution for skillmesh's global home, content store and per-project state.
 *
 * Key design point: a project's config and lockfile do NOT live in the project.
 * They live in the global home, keyed by the (encoded) project path — so the only
 * thing skillmesh ever writes into a project is the skills themselves.
 * All functions are pure: paths depend only on their inputs (and ENV when asked).
 */

import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { dirs, envVars, files } from "../constants";

/** Absolute path to skillmesh's global home (store + per-project state). ENV override or ~/.skillmesh. */
export function homeDir(env: NodeJS.ProcessEnv = process.env): string {
  const override = env[envVars.home];
  return override && override.trim() ? resolve(override) : join(homedir(), ".skillmesh");
}

/** Directory holding the global content store of fetched skills. */
export function storeDir(home: string = homeDir()): string {
  return join(home, dirs.store);
}

/** Path to the global config file (active project + presets). */
export function globalConfigPath(home: string = homeDir()): string {
  return join(home, "config.json");
}

/** Path to the per-host auth file (tokens for private sources). */
export function authConfigPath(home: string = homeDir()): string {
  return join(home, files.auth);
}

/** Path to a single skill's directory inside the store, keyed by `name@version`. */
export function storeSkillDir(name: string, version: string, home: string = homeDir()): string {
  return join(storeDir(home), `${name}@${version}`);
}

/** Encode an absolute project path into a filesystem-safe directory name (Claude-style). */
export function encodeProjectPath(projectPath: string): string {
  return resolve(projectPath).replace(/[/\\:]/g, "-");
}

/** Directory in home holding all per-project state (one encoded subdirectory per project). */
export function projectsDir(home: string = homeDir()): string {
  return join(home, dirs.projects);
}

/** Directory in home holding a single project's state (config + lockfile). */
export function projectStateDir(projectPath: string, home: string = homeDir()): string {
  return join(projectsDir(home), encodeProjectPath(projectPath));
}

/** Path to a project's config file (stored in home, not in the project). */
export function projectConfigPath(projectPath: string, home: string = homeDir()): string {
  return join(projectStateDir(projectPath, home), files.projectConfig);
}

/** Path to a project's home lockfile (local state, stored in home, not in the project). */
export function lockfilePath(projectPath: string, home: string = homeDir()): string {
  return join(projectStateDir(projectPath, home), files.lockfile);
}

/** Path to the opt-in committed lockfile in the project root (team/CI reproducibility). */
export function projectRootLockPath(projectPath: string): string {
  return join(projectPath, files.projectRootLock);
}

/** Path to an installed skill's directory inside the project's skills directory (the only project write). */
export function installedSkillDir(projectPath: string, skillsDir: string, name: string): string {
  return join(projectPath, skillsDir, name);
}

/** Directory holding all installed plugins (ecosystem-wide). */
export function pluginsDir(home: string = homeDir()): string {
  return join(home, dirs.plugins);
}

/** Directory of a single installed plugin, keyed by `name@version`. */
export function pluginDir(name: string, version: string, home: string = homeDir()): string {
  return join(pluginsDir(home), `${name}@${version}`);
}

/** Path to the plugin registry file (enabled state + source for each installed plugin). */
export function pluginsRegistryPath(home: string = homeDir()): string {
  return join(home, files.pluginsRegistry);
}
