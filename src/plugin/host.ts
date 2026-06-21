/**
 * In-memory plugin host: the registry that built-in source dispatch consults to extend itself.
 * A module-level singleton, empty by default — so `parseSource`/`sourceEquals` behave exactly as
 * before when no plugins are loaded. `loadEnabledPlugins` (see ./load) populates it at startup.
 */

import type { PluginSource } from "../types";
import type { FetchResult } from "../sources/types";
import type { ManifestImporter, Plugin, SourceAdapter } from "./types";

const adapters = new Map<string, SourceAdapter>();
const importers: ManifestImporter[] = [];

/** Register a plugin's adapters and importers. Later registrations win on a type clash. */
export function registerPlugin(plugin: Plugin): void {
  for (const adapter of plugin.sources ?? []) adapters.set(adapter.type, adapter);
  for (const importer of plugin.importers ?? []) importers.push(importer);
}

/** Clear all registered adapters/importers (used by tests to isolate the singleton). */
export function resetPlugins(): void {
  adapters.clear();
  importers.length = 0;
}

/** Look up a registered source adapter by its type id. */
export function getSourceAdapter(type: string): SourceAdapter | undefined {
  return adapters.get(type);
}

/** All registered manifest importers. */
export function listImporters(): ManifestImporter[] {
  return [...importers];
}

/**
 * Try to parse a raw CLI source string via a plugin adapter, matched by its `scheme:` prefix.
 * Returns a PluginSource for the first claiming adapter, or null when none claim it. Scheme-based
 * matching keeps plugins in their own namespace and never hijacks the built-in heuristics.
 */
export function parseViaPlugins(raw: string): PluginSource | null {
  for (const adapter of adapters.values()) {
    if (!adapter.scheme || !raw.startsWith(`${adapter.scheme}:`)) continue;
    const payload = adapter.parse(raw);
    if (payload) return { type: "plugin", adapter: adapter.type, payload };
  }
  return null;
}

/** Materialize a plugin source via its owning adapter. */
export async function fetchViaPlugin(source: PluginSource): Promise<FetchResult> {
  const adapter = adapters.get(source.adapter);
  if (!adapter) {
    throw new Error(
      `No plugin provides source adapter '${source.adapter}'. Install/enable it with 'skillmesh plugin'.`,
    );
  }
  return adapter.fetch(source.payload);
}

/** Stable JSON of a payload for order-independent structural comparison. */
function stableStringify(value: Record<string, unknown>): string {
  return JSON.stringify(value, Object.keys(value).sort());
}

/** Structural equality for two plugin sources (delegates to the adapter's `equals` when given). */
export function pluginSourceEquals(a: PluginSource, b: PluginSource): boolean {
  if (a.adapter !== b.adapter) return false;
  const adapter = adapters.get(a.adapter);
  if (adapter?.equals) return adapter.equals(a.payload, b.payload);
  return stableStringify(a.payload) === stableStringify(b.payload);
}

/** One-line origin for a plugin source (delegates to the adapter's `describe` when given). */
export function describePluginSource(source: PluginSource): string {
  const adapter = adapters.get(source.adapter);
  if (adapter?.describe) return `${source.adapter}:${adapter.describe(source.payload)}`;
  return `${source.adapter}:${JSON.stringify(source.payload)}`;
}
