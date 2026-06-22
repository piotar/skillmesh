/**
 * Public plugin contract. A plugin is an external JS module that extends skillmesh with new
 * source kinds and/or importers for foreign project manifests. Kept separate from `src/types.ts`
 * because it depends on `FetchResult` (which `types.ts` must stay free of to avoid cycles).
 */

import type { SourceSpec } from "../types";
import type { FetchResult } from "../sources/types";
import type { AuthHeader } from "../config/auth";

/**
 * Read-only handle skillmesh passes to a plugin's `fetch`/`load`, so plugins can reuse skillmesh's
 * own facilities instead of re-implementing them. Notably `headerForUrl` resolves a private host's
 * credentials from skillmesh's per-host credential store (`~/.skillmesh/auth.json`) — so an adapter
 * fetching from an authenticated registry need not parse that file or reproduce the header logic.
 */
export type PluginContext = {
  /** The resolved skillmesh home directory backing this invocation. */
  home: string;
  /** Resolve the auth header to inject for a URL from skillmesh's credential store, or undefined. */
  headerForUrl(url: string): Promise<AuthHeader | undefined>;
};

/**
 * Teaches skillmesh a new source kind. `parse` claims a CLI source string (returning its own
 * opaque payload, or null when the string isn't ours); `fetch` materializes that payload into a
 * skill directory exactly like a built-in fetcher.
 */
export type SourceAdapter = {
  /** Unique source-type id, e.g. "pypi". Used as `PluginSource.adapter`. */
  type: string;
  /** Explicit `scheme:` prefix this adapter claims on the CLI, e.g. "pypi" → `pypi:requests`. */
  scheme?: string;
  /** Parse a raw source string into this adapter's payload, or null if it isn't ours. */
  parse(input: string): Record<string, unknown> | null;
  /** Materialize a parsed payload into a local skill directory with a resolved version. */
  fetch(payload: Record<string, unknown>, ctx: PluginContext): Promise<FetchResult>;
  /** Optional one-line origin description (for `list`/`preset list`). */
  describe?(payload: Record<string, unknown>): string;
  /** Optional structural equality for two payloads (defaults to deep value comparison). */
  equals?(a: Record<string, unknown>, b: Record<string, unknown>): boolean;
};

/**
 * Reads a foreign manifest from a project and expands it into skill sources to install.
 * `detect` is a cheap check for the manifest's presence; `load` does the actual parsing.
 */
export type ManifestImporter = {
  /** Human-readable importer name (e.g. the foreign tool it adapts). */
  name: string;
  /** Whether this importer has something to contribute for the given project directory. */
  detect(projectDir: string): Promise<boolean> | boolean;
  /** Parse the foreign manifest into a list of skill sources. */
  load(projectDir: string, ctx: PluginContext): Promise<SourceSpec[]>;
};

/** What a plugin module provides. Exported as the module's default (object or `register` fn). */
export type Plugin = {
  meta: { name: string; apiVersion: number };
  sources?: SourceAdapter[];
  importers?: ManifestImporter[];
};

/** A plugin module may default-export a Plugin object or a function returning one. */
export type PluginModule = Plugin | (() => Plugin | Promise<Plugin>);
