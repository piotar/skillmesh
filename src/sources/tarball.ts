/** Fetch a skill from a downloadable archive (tar/tgz/zip). Version = content hash. */

import { readdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { TarballSource } from "../types";
import { headerForUrl } from "../config/auth";
import { ensureDir } from "../util/fs";
import { hashDir } from "../util/hash";
import type { Fetcher, Materialized } from "./types";
import { exec, makeTempDir, resolveSkillDir } from "./util";

/** If an archive wraps its content in a single top-level folder, descend into it. */
async function unwrap(dir: string): Promise<string> {
  const entries = await readdir(dir, { withFileTypes: true });
  if (entries.length === 1 && entries[0]?.isDirectory()) return join(dir, entries[0].name);
  return dir;
}

/** Download an archive and extract it (bsdtar auto-detects gzip/zip). Version = content hash. */
export async function materializeTarball(source: TarballSource): Promise<Materialized> {
  const tmp = await makeTempDir("skillmesh-tarball-");
  const cleanup = () => rm(tmp, { recursive: true, force: true });
  try {
    // Attach a per-host auth header when one is configured (private archive hosts).
    const header = await headerForUrl(source.url);
    const res = await fetch(source.url, header ? { headers: { [header.name]: header.value } } : undefined);
    if (!res.ok) throw new Error(`Failed to download ${source.url} (HTTP ${res.status})`);

    const archive = join(tmp, "archive");
    await writeFile(archive, Buffer.from(await res.arrayBuffer()));

    const extracted = join(tmp, "extracted");
    await ensureDir(extracted);
    await exec(["tar", "-xf", archive, "-C", extracted]);

    return { root: source.subpath ? extracted : await unwrap(extracted), cleanup };
  } catch (err) {
    await cleanup();
    throw err;
  }
}

/** Download an archive, extract it (bsdtar auto-detects gzip/zip), and resolve the skill directory. */
export const fetchTarball: Fetcher<TarballSource> = async (source) => {
  const m = await materializeTarball(source);
  try {
    const dir = await resolveSkillDir(m.root, source.subpath);
    const version = await hashDir(dir);
    return { dir, version, cleanup: m.cleanup };
  } catch (err) {
    await m.cleanup();
    throw err;
  }
};
