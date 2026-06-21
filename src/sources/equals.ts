/** Structural equality for source specs (used to detect duplicates in locks and presets). */

import type {
  GitSource,
  GithubSource,
  LocalSource,
  NpmSource,
  PluginSource,
  SourceSpec,
  TarballSource,
} from "../types";
import { pluginSourceEquals } from "../plugin/host";

/** Whether two source specs refer to the same origin. */
export function sourceEquals(a: SourceSpec, b: SourceSpec): boolean {
  if (a.type !== b.type) return false;
  switch (a.type) {
    case "local":
      return a.path === (b as LocalSource).path;
    case "git": {
      const o = b as GitSource;
      return a.url === o.url && a.ref === o.ref && a.subpath === o.subpath;
    }
    case "github": {
      const o = b as GithubSource;
      return a.repo === o.repo && a.ref === o.ref && a.subpath === o.subpath;
    }
    case "npm": {
      const o = b as NpmSource;
      return a.package === o.package && a.version === o.version && a.subpath === o.subpath;
    }
    case "tarball": {
      const o = b as TarballSource;
      return a.url === o.url && a.subpath === o.subpath;
    }
    case "plugin":
      return pluginSourceEquals(a, b as PluginSource);
  }
}
