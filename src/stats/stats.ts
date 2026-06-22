/**
 * Aggregate global and active-project statistics for `skillmesh stats`.
 * Read-only: walks the home directory (store, projects, plugins) and the active project's
 * lockfile/install state, reusing the existing domain readers rather than re-deriving paths.
 */

import { readdir } from "node:fs/promises";
import { homeDir, projectsDir, storeDir } from "../config/paths";
import { resolveActiveProject } from "../config/global";
import { isInitialized } from "../config/project";
import { readPluginsRegistry } from "../plugin/registry";
import { listSkills, projectStatus } from "../registry/registry";
import { listStore, readStoreMeta } from "../store/store";
import type { SourceType } from "../types";
import { dirSize } from "../util/fs";

/** Stats about the global content store of fetched skills. */
export type StoreStats = {
  /** Total `name@version` entries cached in the store. */
  versions: number;
  /** Distinct skill names (counting all versions of a skill once). */
  names: number;
  /** How many store entries came from each source type. */
  bySource: Partial<Record<SourceType, number>>;
  /** Total size on disk, in bytes. */
  sizeBytes: number;
};

/** Stats about the currently active project. */
export type ActiveProjectStats = {
  path: string;
  initialized: boolean;
  /** Total skills (managed + project-local); only meaningful when initialized. */
  total: number;
  managed: number;
  local: number;
  ok: number;
  missing: number;
  broken: number;
  healthy: boolean;
};

/** A complete snapshot of skillmesh's local state. */
export type Stats = {
  /** Absolute path to the global home (store + per-project state + plugins). */
  home: string;
  /** Number of projects skillmesh is tracking state for. */
  projectsTracked: number;
  plugins: { total: number; enabled: number };
  store: StoreStats;
  active: ActiveProjectStats;
};

/** Count the immediate subdirectories of a directory (0 when it does not exist). */
async function countSubdirs(path: string): Promise<number> {
  try {
    const entries = await readdir(path, { withFileTypes: true });
    return entries.filter((e) => e.isDirectory()).length;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return 0;
    throw err;
  }
}

/** Aggregate store stats: version/name counts, a per-source breakdown and total disk usage. */
async function collectStoreStats(home: string): Promise<StoreStats> {
  const entries = await listStore(home);
  const names = new Set<string>();
  const bySource: Partial<Record<SourceType, number>> = {};

  for (const entry of entries) {
    names.add(entry.name);
    const manifest = await readStoreMeta(entry.name, entry.version, home);
    if (manifest) bySource[manifest.source.type] = (bySource[manifest.source.type] ?? 0) + 1;
  }

  return {
    versions: entries.length,
    names: names.size,
    bySource,
    sizeBytes: await dirSize(storeDir(home)),
  };
}

/** Aggregate health stats for the active project (empty counts when uninitialized). */
async function collectActiveStats(projectPath: string, home: string): Promise<ActiveProjectStats> {
  const empty: ActiveProjectStats = {
    path: projectPath,
    initialized: false,
    total: 0,
    managed: 0,
    local: 0,
    ok: 0,
    missing: 0,
    broken: 0,
    healthy: true,
  };
  if (!(await isInitialized(projectPath, home))) return empty;

  const skills = await listSkills({ projectPath, home });
  const report = await projectStatus({ projectPath, home });
  return {
    path: projectPath,
    initialized: true,
    total: skills.length,
    managed: skills.filter((s) => s.kind === "managed").length,
    local: report.local.length,
    ok: report.ok.length,
    missing: report.missing.length,
    broken: report.broken.length,
    healthy: report.healthy,
  };
}

/** Gather a full snapshot of skillmesh's local state for `skillmesh stats`. */
export async function collectStats(opts: { home?: string } = {}): Promise<Stats> {
  const home = opts.home ?? homeDir();
  const [projectsTracked, plugins, store, projectPath] = await Promise.all([
    countSubdirs(projectsDir(home)),
    readPluginsRegistry(home),
    collectStoreStats(home),
    resolveActiveProject({ home }),
  ]);

  return {
    home,
    projectsTracked,
    plugins: {
      total: plugins.plugins.length,
      enabled: plugins.plugins.filter((p) => p.enabled).length,
    },
    store,
    active: await collectActiveStats(projectPath, home),
  };
}
