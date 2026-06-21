/** Read/write the global config and resolve which project is currently active. */

import { dirname, resolve } from "node:path";
import { envVars } from "../constants";
import type { GlobalConfig } from "../types";
import { readJson, writeJson } from "../util/fs";
import { globalConfigPath } from "./paths";
import { isInitialized } from "./project";

/** The global config used when none has been written yet. */
function defaultGlobalConfig(): GlobalConfig {
  return { version: 1, presets: {} };
}

/** Read the global config, falling back to defaults when it does not exist. */
export async function readGlobalConfig(home?: string): Promise<GlobalConfig> {
  const data = await readJson<GlobalConfig>(globalConfigPath(home));
  return data ?? defaultGlobalConfig();
}

/** Persist the global config to disk. */
export async function writeGlobalConfig(config: GlobalConfig, home?: string): Promise<void> {
  await writeJson(globalConfigPath(home), config);
}

/** Options for resolving the active project (injectable for testing). */
export type ResolveProjectOptions = {
  env?: NodeJS.ProcessEnv;
  cwd?: string;
  home?: string;
};

/**
 * Resolve the active project path, in priority order:
 *   1. the SKILLMESH_PROJECT env override;
 *   2. the nearest initialized project at or above cwd (cwd, then its ancestors);
 *   3. cwd.
 * The project is resolved purely from where you stand — like git resolving the enclosing
 * repo from any subdirectory — so there is no hidden global pin that can target the wrong one.
 */
export async function resolveActiveProject(opts: ResolveProjectOptions = {}): Promise<string> {
  const env = opts.env ?? process.env;
  const fromEnv = env[envVars.project];
  if (fromEnv && fromEnv.trim()) return resolve(fromEnv);

  const cwd = resolve(opts.cwd ?? process.cwd());
  const enclosing = await findInitializedFrom(cwd, opts.home);
  if (enclosing) return enclosing;

  return cwd;
}

/** Walk from `start` up through ancestor directories, returning the first initialized project. */
async function findInitializedFrom(start: string, home?: string): Promise<string | null> {
  let dir = start;
  for (let parent = dirname(dir); ; parent = dirname(dir)) {
    if (await isInitialized(dir, home)) return dir;
    if (parent === dir) return null; // reached the filesystem root
    dir = parent;
  }
}
