/** Deterministic content hashing for skill directories (used for versions and integrity). */

import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import { files } from "../constants";

/** Recursively collect absolute paths of all files under a directory. */
async function listFiles(dir: string): Promise<string[]> {
  const out: string[] = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await listFiles(full)));
    else if (entry.isFile()) out.push(full);
  }
  return out;
}

/**
 * Compute a deterministic sha256 over a directory's relative file paths and contents.
 * The skillmesh sidecar is excluded so a skill's hash reflects its content, not our metadata.
 */
export async function hashDir(dir: string): Promise<string> {
  const all = await listFiles(dir);
  const tracked = all
    .filter((file) => relative(dir, file) !== files.sidecar)
    .sort((a, b) => a.localeCompare(b));

  const hash = createHash("sha256");
  for (const file of tracked) {
    const rel = relative(dir, file).split(sep).join("/"); // normalize separators across platforms
    hash.update(rel);
    hash.update("\0");
    hash.update(await readFile(file));
    hash.update("\0");
  }
  return hash.digest("hex");
}
