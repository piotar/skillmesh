/**
 * Persistence for the plugin registry (`~/.skillmesh/plugins.json`): the ecosystem-wide list of
 * installed plugins and their enabled state. Pure read/write + small immutable list helpers;
 * orchestration (install/enable/remove) lives in ./manage.
 */

import { pluginsRegistryPath } from "../config/paths";
import type { SourceSpec } from "../types";
import { readJson, writeJson } from "../util/fs";

/** A single installed plugin, recorded ecosystem-wide. */
export type InstalledPlugin = {
  /** The plugin's declared name (`Plugin.meta.name`); unique within the registry. */
  name: string;
  /** Where the plugin was installed from, for `update`/reinstall. */
  source: SourceSpec;
  /** Resolved version identity (git commit, npm version, content hash). */
  version: string;
  /** When false, the plugin stays installed but is not loaded. */
  enabled: boolean;
  /** Absolute install directory under the home plugins dir. */
  dir: string;
  /** Absolute path to the plugin's entry module (from its `skillmesh.plugin` manifest field). */
  entry: string;
};

/** The on-disk shape of `plugins.json`. */
export type PluginsRegistry = { version: number; plugins: InstalledPlugin[] };

/** Read the plugin registry, falling back to an empty one when it does not exist. */
export async function readPluginsRegistry(home?: string): Promise<PluginsRegistry> {
  const data = await readJson<PluginsRegistry>(pluginsRegistryPath(home));
  return data ?? { version: 1, plugins: [] };
}

/** Persist the plugin registry. */
export async function writePluginsRegistry(registry: PluginsRegistry, home?: string): Promise<void> {
  await writeJson(pluginsRegistryPath(home), registry);
}

/** Insert or replace a plugin (matched by name), returning a new registry. */
export function upsertPlugin(registry: PluginsRegistry, plugin: InstalledPlugin): PluginsRegistry {
  const plugins = registry.plugins.filter((p) => p.name !== plugin.name);
  plugins.push(plugin);
  return { ...registry, plugins: plugins.sort((a, b) => a.name.localeCompare(b.name)) };
}

/** Remove a plugin by name, returning a new registry. */
export function removePlugin(registry: PluginsRegistry, name: string): PluginsRegistry {
  return { ...registry, plugins: registry.plugins.filter((p) => p.name !== name) };
}

/** Find a plugin by name. */
export function findPlugin(registry: PluginsRegistry, name: string): InstalledPlugin | undefined {
  return registry.plugins.find((p) => p.name === name);
}
