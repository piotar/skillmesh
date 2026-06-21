/** Dispatch a SourceSpec to the matching fetcher. */

import type { SourceSpec } from "../types";
import { fetchViaPlugin } from "../plugin/host";
import { fetchGit } from "./git";
import { fetchGithub } from "./github";
import { fetchLocal } from "./local";
import { fetchNpm } from "./npm";
import { fetchTarball } from "./tarball";
import type { FetchResult } from "./types";

/** Materialize any supported source into a local directory with a resolved version. */
export function fetchSource(source: SourceSpec): Promise<FetchResult> {
  switch (source.type) {
    case "local":
      return fetchLocal(source);
    case "git":
      return fetchGit(source);
    case "github":
      return fetchGithub(source);
    case "npm":
      return fetchNpm(source);
    case "tarball":
      return fetchTarball(source);
    case "plugin":
      return fetchViaPlugin(source);
  }
}
