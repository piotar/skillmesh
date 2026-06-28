/** Fetch a skill from a git repository, optionally a ref and a subdirectory. Version = resolved commit. */

import { rm } from "node:fs/promises";
import type { GitSource } from "../types";
import { authHeader, hostOf, lookupHostAuth, readAuthConfig } from "../config/auth";
import type { Fetcher, VersionedMaterialized } from "./types";
import { exec, makeTempDir, resolveSkillDir } from "./util";

/**
 * Build the `-c` args that attach a per-host auth header to an HTTPS clone, or none when the host has
 * no configured credential. The header is scoped to the exact host (`http.https://host/.extraHeader`)
 * so it is not resent if the clone redirects elsewhere, and the token stays out of `source.url` — and
 * thus out of the lockfile and sidecar. (The token does appear in this child process's argv, visible
 * to local `ps`; acceptable for a local CLI.)
 */
export async function authConfigArgs(url: string): Promise<string[]> {
  if (!/^https:\/\//i.test(url)) return [];
  const host = hostOf(url);
  if (!host) return [];
  const auth = lookupHostAuth(host, await readAuthConfig());
  if (!auth) return [];
  const header = authHeader(auth);
  return ["-c", `http.https://${host}/.extraHeader=${header.name}: ${header.value}`];
}

/** Clone a repo into a temp dir and check out the requested ref. Version = resolved commit. */
export async function materializeGit(source: GitSource): Promise<VersionedMaterialized> {
  const tmp = await makeTempDir("skillmesh-git-");
  const cleanup = () => rm(tmp, { recursive: true, force: true });
  try {
    await exec(["git", ...(await authConfigArgs(source.url)), "clone", source.url, tmp]);
    if (source.ref) {
      await exec(["git", "-C", tmp, "-c", "advice.detachedHead=false", "checkout", source.ref]);
    }
    const version = await exec(["git", "-C", tmp, "rev-parse", "HEAD"]);
    return { root: tmp, version, cleanup };
  } catch (err) {
    await cleanup();
    throw err;
  }
}

/** Clone a repo into a temp dir, check out the requested ref, and resolve the skill directory. */
export const fetchGit: Fetcher<GitSource> = async (source) => {
  const m = await materializeGit(source);
  try {
    const dir = await resolveSkillDir(m.root, source.subpath);
    return { dir, version: m.version, cleanup: m.cleanup };
  } catch (err) {
    await m.cleanup();
    throw err;
  }
};
