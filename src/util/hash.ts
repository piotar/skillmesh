/** Deterministic content hashing for skill directories (used for versions and integrity). */

import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { join, relative, sep } from "node:path";

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
 * Store content directories are pristine (provenance lives in a sibling file), so every file counts.
 */
export async function hashDir(dir: string): Promise<string> {
  const tracked = (await listFiles(dir)).sort((a, b) => a.localeCompare(b));

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
