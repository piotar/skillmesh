/**
 * Build the read-only PluginContext skillmesh hands to a plugin's `fetch`/`load`. Centralizing it
 * here keeps the wiring in one place and binds the (optionally overridden) home into the helpers, so
 * a plugin's `headerForUrl(url)` resolves credentials against the same home skillmesh is using.
 */

import { headerForUrl } from "../config/auth";
import { homeDir } from "../config/paths";
import type { PluginContext } from "./types";

/** Construct a PluginContext for the given home (defaults to the resolved skillmesh home). */
export function buildPluginContext(home?: string): PluginContext {
  const resolved = home ?? homeDir();
  return {
    home: resolved,
    headerForUrl: (url) => headerForUrl(url, resolved),
  };
}
