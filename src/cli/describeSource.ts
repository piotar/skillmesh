/** Render a SourceSpec as a compact, human-readable origin string (shared across CLI commands). */

import { describePluginSource } from "../plugin/host";
import type { SourceSpec } from "../types";

/** Render the in-source subdirectory (the skill's location within a repo/package), if any. */
function subpathSuffix(subpath: string | undefined): string {
  return subpath ? ` (${subpath})` : "";
}

/** A one-line origin like `git:https://…#main` or `npm:pkg@1.2.3`. */
export function describeSource(source: SourceSpec): string {
  switch (source.type) {
    case "local":
      return `local:${source.path}`;
    case "git":
      return `git:${source.url}${source.ref ? `#${source.ref}` : ""}${subpathSuffix(source.subpath)}`;
    case "github":
      return `github:${source.repo}${source.ref ? `#${source.ref}` : ""}${subpathSuffix(source.subpath)}`;
    case "npm":
      return `npm:${source.package}${source.version ? `@${source.version}` : ""}${subpathSuffix(source.subpath)}`;
    case "tarball":
      return `tarball:${source.url}${subpathSuffix(source.subpath)}`;
    case "plugin":
      return describePluginSource(source);
  }
}
