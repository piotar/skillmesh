/** Fetch a skill from a local filesystem path (delivered in place — no temp dir, no copy here). */

import { homedir } from "node:os";
import { resolve } from "node:path";
import type { LocalSource } from "../types";
import { hashDir } from "../util/hash";
import type { Fetcher, Materialized } from "./types";
import { resolveSkillDir } from "./util";

/** Expand a leading `~` to the user's home directory. */
function expandHome(path: string): string {
  return path === "~" || path.startsWith("~/") || path.startsWith("~\\")
    ? homedir() + path.slice(1)
    : path;
}

/** Resolve a local path in place (no temp dir, no copy). Version = content hash of the entry dir. */
export function materializeLocal(source: LocalSource): Materialized {
  return { root: resolve(expandHome(source.path)), cleanup: async () => {} };
}

/** Resolve a local skill directory and hash its content as the version. */
export const fetchLocal: Fetcher<LocalSource> = async (source) => {
  const m = materializeLocal(source);
  const dir = await resolveSkillDir(m.root);
  const version = await hashDir(dir);
  return { dir, version, cleanup: m.cleanup };
};
