/** Shared CLI helpers for parsing source-related arguments (mode and ref/subpath overrides). */

import type { InstallMode, SourceSpec } from "../types";

/** Coerce a raw mode string into a valid InstallMode, throwing on anything else. */
export function parseMode(value: string | undefined): InstallMode | undefined {
  if (value === undefined) return undefined;
  if (value === "link" || value === "copy") return value;
  throw new Error(`Invalid --mode '${value}'. Expected 'link' or 'copy'.`);
}

/** Apply CLI ref/subpath overrides onto a parsed source spec where they apply.
 *  Plugin sources own their full payload, so generic ref/subpath overrides don't apply to them. */
export function withOverrides(spec: SourceSpec, ref?: string, subpath?: string): SourceSpec {
  let out = spec;
  if (ref && (out.type === "git" || out.type === "github")) out = { ...out, ref };
  if (subpath && out.type !== "local" && out.type !== "plugin") out = { ...out, subpath };
  return out;
}
