/**
 * Plugin lifecycle: install (from any source), enable/disable and remove. Mirrors the skill flow —
 * a source is materialized once, validated as a plugin, then copied into the ecosystem-wide plugins
 * dir and recorded in the registry. Newly installed plugins are enabled by default.
 */

import { join } from "node:path";
import { rm } from "node:fs/promises";
import { pluginDir } from "../config/paths";
import { materializeSource } from "../sources/materialize";
import { resolvePluginDir } from "../sources/util";
import type { SourceSpec } from "../types";
import { copyDir } from "../util/fs";
import { hashDir } from "../util/hash";
import { loadPluginModule } from "./load";
import {
  findPlugin,
  type InstalledPlugin,
  readPluginsRegistry,
  removePlugin as removeFromRegistry,
  upsertPlugin,
  writePluginsRegistry,
} from "./registry";
import type { Plugin } from "./types";

/** The subpath carried by a source, if any (local sources have none). */
function sourceSubpath(source: SourceSpec): string | undefined {
  return "subpath" in source ? source.subpath : undefined;
}

/** Outcome of installing a plugin: its registry record plus the loaded module (for reporting). */
export type InstallPluginResult = { installed: InstalledPlugin; plugin: Plugin };

/**
 * Install a plugin from any supported source: fetch → validate manifest → copy into the plugins dir
 * → record in the registry (enabled). Returns the registry entry and the loaded plugin module.
 */
export async function installPlugin(source: SourceSpec, home?: string): Promise<InstallPluginResult> {
  const m = await materializeSource(source);
  try {
    const { dir, manifest } = await resolvePluginDir(m.root, sourceSubpath(source));
    const plugin = await loadPluginModule(join(dir, manifest.plugin));
    const version = m.version ?? (await hashDir(dir));

    const target = pluginDir(plugin.meta.name, version, home);
    await rm(target, { recursive: true, force: true });
    await copyDir(dir, target);

    const installed: InstalledPlugin = {
      name: plugin.meta.name,
      source,
      version,
      enabled: true,
      dir: target,
      entry: join(target, manifest.plugin),
    };
    await writePluginsRegistry(upsertPlugin(await readPluginsRegistry(home), installed), home);
    return { installed, plugin };
  } finally {
    await m.cleanup();
  }
}

/** Flip a plugin's enabled flag. Throws when the plugin isn't installed. */
async function setEnabled(name: string, enabled: boolean, home?: string): Promise<void> {
  const registry = await readPluginsRegistry(home);
  const plugin = findPlugin(registry, name);
  if (!plugin) throw new Error(`Plugin '${name}' is not installed`);
  await writePluginsRegistry(upsertPlugin(registry, { ...plugin, enabled }), home);
}

/** Enable an installed plugin so it loads on subsequent commands. */
export function enablePlugin(name: string, home?: string): Promise<void> {
  return setEnabled(name, true, home);
}

/** Disable an installed plugin without removing it. */
export function disablePlugin(name: string, home?: string): Promise<void> {
  return setEnabled(name, false, home);
}

/** Remove a plugin from the ecosystem: drop its registry entry and delete its install dir. */
export async function removePlugin(name: string, home?: string): Promise<void> {
  const registry = await readPluginsRegistry(home);
  const plugin = findPlugin(registry, name);
  if (!plugin) throw new Error(`Plugin '${name}' is not installed`);
  await rm(plugin.dir, { recursive: true, force: true });
  await writePluginsRegistry(removeFromRegistry(registry, name), home);
}

/** List all installed plugins. */
export async function listPlugins(home?: string): Promise<InstalledPlugin[]> {
  return (await readPluginsRegistry(home)).plugins;
}
