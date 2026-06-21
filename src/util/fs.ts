/** Thin filesystem helpers used by the IO-bound domains, isolating side effects. */

import { cp, mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import type { Dirent } from "node:fs";
import { dirname, join } from "node:path";

/** Read a UTF-8 text file. */
export function readText(path: string): Promise<string> {
  return readFile(path, "utf8");
}

/** Write a UTF-8 text file, creating parent dirs as needed. */
export async function writeText(path: string, data: string): Promise<void> {
  await ensureDir(dirname(path));
  await writeFile(path, data, "utf8");
}

/** Whether a path exists (file or directory). */
export async function pathExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

/** Whether a path exists and is a directory. */
export async function isDirectory(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isDirectory();
  } catch {
    return false;
  }
}

/** Ensure a directory exists, creating parents as needed. */
export async function ensureDir(path: string): Promise<void> {
  await mkdir(path, { recursive: true });
}

/** Read and parse a JSON file, or return null when the file does not exist. */
export async function readJson<T>(path: string): Promise<T | null> {
  let raw: string;
  try {
    raw = await readFile(path, "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  }
  return JSON.parse(raw) as T;
}

/** Serialize data to a JSON file (pretty-printed), creating parent dirs as needed. */
export async function writeJson(path: string, data: unknown): Promise<void> {
  await ensureDir(dirname(path));
  await writeFile(path, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

/** Recursively copy a directory's contents into a destination, creating it as needed. */
export async function copyDir(src: string, dest: string): Promise<void> {
  await cp(src, dest, { recursive: true });
}

/** Total size in bytes of all files under a directory (recursive), or 0 when it does not exist. */
export async function dirSize(path: string): Promise<number> {
  let entries: Dirent[];
  try {
    entries = await readdir(path, { withFileTypes: true });
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return 0;
    throw err;
  }

  let total = 0;
  for (const entry of entries) {
    const full = join(path, entry.name);
    if (entry.isDirectory()) total += await dirSize(full);
    else if (entry.isFile()) total += (await stat(full)).size;
  }
  return total;
}
