/**
 * Load enabled plugins into the host. Plugins are external JS modules under the home plugins dir,
 * imported dynamically at runtime (so they're never bundled into the built CLI). Everything here is
 * best-effort: a broken or incompatible plugin warns on stderr and is skipped, never crashing the
 * command the user actually ran — mirroring the startup self-management philosophy.
 */

import { pathToFileURL } from "node:url";
import { pluginApiVersion } from "../constants";
import { registerPlugin } from "./host";
import { readPluginsRegistry } from "./registry";
import type { Plugin, PluginModule } from "./types";

/** Coerce a module's default export (object or factory fn) into a Plugin. */
async function normalize(mod: PluginModule): Promise<Plugin> {
  return typeof mod === "function" ? mod() : mod;
}

/**
 * Import a plugin entry module and return its normalized Plugin. Throws on a missing default export
 * or an incompatible API version, so callers can report a precise reason.
 */
export async function loadPluginModule(entry: string): Promise<Plugin> {
  const imported = (await import(pathToFileURL(entry).href)) as { default?: PluginModule };
  if (!imported.default) throw new Error(`Plugin at ${entry} has no default export`);
  const plugin = await normalize(imported.default);
  if (plugin.meta?.apiVersion !== pluginApiVersion) {
    throw new Error(
      `Plugin '${plugin.meta?.name ?? entry}' targets API v${plugin.meta?.apiVersion}, but this skillmesh speaks v${pluginApiVersion}`,
    );
  }
  return plugin;
}

/** Load and register every enabled plugin. Failures are reported but never thrown. */
export async function loadEnabledPlugins(home?: string): Promise<void> {
  let registry;
  try {
    registry = await readPluginsRegistry(home);
  } catch {
    return; // an unreadable registry must not break ordinary commands
  }
  for (const installed of registry.plugins) {
    if (!installed.enabled) continue;
    try {
      registerPlugin(await loadPluginModule(installed.entry));
    } catch (err) {
      process.stderr.write(`Skipping plugin '${installed.name}': ${(err as Error).message}\n`);
    }
  }
}
