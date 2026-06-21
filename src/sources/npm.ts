/** Fetch a skill from an npm package via `npm pack` (download without installing). Version = npm version. */

import { readdir, rm } from "node:fs/promises";
import { join } from "node:path";
import type { NpmSource } from "../types";
import { ensureDir, isDirectory } from "../util/fs";
import type { Fetcher, Materialized } from "./types";
import { exec, makeTempDir, npmBin, resolveSkillDir } from "./util";

/** The relevant fields of an `npm pack --json` result. */
type PackResult = { filename: string; version: string };

/** `npm pack` wraps content in a top-level `package/` folder; descend into it (or a lone subdir). */
async function packageRoot(dir: string): Promise<string> {
  const wrapped = join(dir, "package");
  if (await isDirectory(wrapped)) return wrapped;
  const entries = await readdir(dir, { withFileTypes: true });
  if (entries.length === 1 && entries[0]?.isDirectory()) return join(dir, entries[0].name);
  return dir;
}

/** Pack an npm package into a temp dir and extract it. Version = npm version. */
export async function materializeNpm(source: NpmSource): Promise<Materialized> {
  const tmp = await makeTempDir("skillmesh-npm-");
  const cleanup = () => rm(tmp, { recursive: true, force: true });
  try {
    const spec = source.version ? `${source.package}@${source.version}` : source.package;
    const out = await exec([npmBin, "pack", spec, "--pack-destination", tmp, "--json"]);
    const pack = (JSON.parse(out) as PackResult[])[0];
    if (!pack) throw new Error(`npm pack produced no output for '${spec}'`);

    const extracted = join(tmp, "extracted");
    await ensureDir(extracted);
    await exec(["tar", "-xzf", join(tmp, pack.filename), "-C", extracted]);

    return { root: await packageRoot(extracted), version: pack.version, cleanup };
  } catch (err) {
    await cleanup();
    throw err;
  }
}

/** Pack an npm package into a temp dir, extract it, and resolve the skill directory. */
export const fetchNpm: Fetcher<NpmSource> = async (source) => {
  const m = await materializeNpm(source);
  try {
    const dir = await resolveSkillDir(m.root, source.subpath);
    return { dir, version: m.version!, cleanup: m.cleanup };
  } catch (err) {
    await m.cleanup();
    throw err;
  }
};
