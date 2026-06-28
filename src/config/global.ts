/** Read/write the global config and resolve which project is currently active. */

import { dirname, resolve } from "node:path";
import { envVars } from "../constants";
import { sourceEquals } from "../sources/equals";
import { normalizeSource } from "../sources/resolve";
import type { GlobalConfig, Preset, SourceSpec } from "../types";
import { readJson, writeJson } from "../util/fs";
import { globalConfigPath } from "./paths";
import { isInitialized } from "./project";

/** The global config used when none has been written yet. */
function defaultGlobalConfig(): GlobalConfig {
  return { version: 1, presets: {} };
}

/** Drop later sources that are structurally equal to an earlier one. */
function dedupeSources(sources: SourceSpec[]): SourceSpec[] {
  return sources.filter((s, i) => sources.findIndex((o) => sourceEquals(o, s)) === i);
}

/**
 * Canonicalize local source paths across all presets, idempotently migrating configs written before
 * paths were normalized at parse time. Deduplicates afterwards, as differently-spelled local paths
 * (e.g. relative vs. absolute, or mixed separators) can collapse to the same canonical source.
 */
function normalizeConfig(config: GlobalConfig): GlobalConfig {
  const presets = Object.fromEntries(
    Object.entries(config.presets).map(([name, preset]): [string, Preset] => [
      name,
      { ...preset, sources: dedupeSources(preset.sources.map(normalizeSource)) },
    ]),
  );
  return { ...config, presets };
}

/** Read the global config, falling back to defaults when it does not exist. */
export async function readGlobalConfig(home?: string): Promise<GlobalConfig> {
  const data = await readJson<GlobalConfig>(globalConfigPath(home));
  return normalizeConfig(data ?? defaultGlobalConfig());
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
