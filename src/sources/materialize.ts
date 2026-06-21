/**
 * Dispatch a SourceSpec to the matching materializer — the download step *before* validating a
 * specific entry directory. Shared by the skill path (`fetch.ts`, then `resolveSkillDir`) and the
 * plugin-install path (`resolvePluginDir`), so any source kind can deliver either payload.
 */

import type { SourceSpec } from "../types";
import { materializeGit } from "./git";
import { materializeGithub } from "./github";
import { materializeLocal } from "./local";
import { materializeNpm } from "./npm";
import { materializeTarball } from "./tarball";
import type { Materialized } from "./types";

/** Materialize any supported source into a local root directory (no skill/plugin validation yet). */
export function materializeSource(source: SourceSpec): Promise<Materialized> {
  switch (source.type) {
    case "local":
      return Promise.resolve(materializeLocal(source));
    case "git":
      return materializeGit(source);
    case "github":
      return materializeGithub(source);
    case "npm":
      return materializeNpm(source);
    case "tarball":
      return materializeTarball(source);
    case "plugin":
      throw new Error("Plugin sources cannot be installed as plugins themselves.");
  }
}
