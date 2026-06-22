/**
 * The global content store of fetched skills, keyed by `name@version` under the home directory.
 * The store holds canonical skill content; projects either link to it or copy from it.
 */

import { readdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { files } from "../constants";
import { storeDir, storeSkillDir, storeSkillMetaPath } from "../config/paths";
import { parseSkillMd } from "../skill/frontmatter";
import type { SkillManifest, SourceSpec } from "../types";
import { copyDir, ensureDir, isDirectory, readJson, readText, writeJson } from "../util/fs";

/** Build a store entry's provenance metadata, stamping the current install time. */
export function buildManifest(input: Omit<SkillManifest, "installedAt">): SkillManifest {
  return { ...input, installedAt: new Date().toISOString() };
}

/** Read a store entry's provenance metadata, or null when absent. */
export function readStoreMeta(
  name: string,
  version: string,
  home?: string,
): Promise<SkillManifest | null> {
  return readJson<SkillManifest>(storeSkillMetaPath(name, version, home));
}

/** Write a store entry's provenance metadata (sibling to the content directory). */
export async function writeStoreMeta(manifest: SkillManifest, home?: string): Promise<void> {
  await writeJson(storeSkillMetaPath(manifest.name, manifest.version, home), manifest);
}

/** A skill present in the store. */
export type StoreEntry = {
  name: string;
  version: string;
  path: string;
};

/** A store entry enriched with the data needed to display and reinstall it from cache. */
export type StoreListing = StoreEntry & {
  /** Original origin source, read from the entry's provenance metadata (absent when unknown). */
  source?: SourceSpec;
  /** The skill's one-line description, read from its SKILL.md (absent when unreadable). */
  description?: string;
};

/** Parse a `name@version` store directory name into its parts, or null when malformed. */
function parseEntryName(dirName: string): { name: string; version: string } | null {
  const at = dirName.lastIndexOf("@");
  if (at <= 0 || at === dirName.length - 1) return null;
  return { name: dirName.slice(0, at), version: dirName.slice(at + 1) };
}

/** Whether a given skill version exists in the store. */
export async function hasStoreSkill(name: string, version: string, home?: string): Promise<boolean> {
  return isDirectory(storeSkillDir(name, version, home));
}

/** Get a store entry by name and version, or null when absent. */
export async function getStoreSkill(
  name: string,
  version: string,
  home?: string,
): Promise<StoreEntry | null> {
  const path = storeSkillDir(name, version, home);
  return (await isDirectory(path)) ? { name, version, path } : null;
}

/**
 * Add a fetched skill's content into the store at `name@version`, recording its provenance in a
 * sibling metadata file (the content directory itself stays byte-for-byte the fetched artifact).
 * Any existing entry at the same key is replaced. Returns the store path.
 */
export async function addToStore(
  contentDir: string,
  manifest: SkillManifest,
  home?: string,
): Promise<string> {
  const dest = storeSkillDir(manifest.name, manifest.version, home);
  await rm(dest, { recursive: true, force: true });
  await ensureDir(dest);
  await copyDir(contentDir, dest);
  await writeStoreMeta(manifest, home);
  return dest;
}

/** List every skill present in the store, sorted by name then version. */
export async function listStore(home?: string): Promise<StoreEntry[]> {
  const dir = storeDir(home);
  if (!(await isDirectory(dir))) return [];

  const entries: StoreEntry[] = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const parsed = parseEntryName(entry.name);
    if (parsed) entries.push({ ...parsed, path: join(dir, entry.name) });
  }
  return entries.sort((a, b) =>
    a.name === b.name ? a.version.localeCompare(b.version) : a.name.localeCompare(b.name),
  );
}

/**
 * List every cached skill enriched with its origin source (from the sidecar manifest) and
 * description (from SKILL.md). Entries are tolerant of missing/invalid metadata — a malformed
 * manifest just leaves `source` undefined (it can be shown but not reinstalled from cache).
 */
export async function listStoreEntries(home?: string): Promise<StoreListing[]> {
  return Promise.all((await listStore(home)).map((entry) => enrichEntry(entry, home)));
}

/** Read an entry's origin source and description, ignoring missing/invalid metadata. */
async function enrichEntry(entry: StoreEntry, home?: string): Promise<StoreListing> {
  const listing: StoreListing = { ...entry };
  const manifest = await readStoreMeta(entry.name, entry.version, home);
  if (manifest) listing.source = manifest.source;
  try {
    listing.description = parseSkillMd(await readText(join(entry.path, files.skill))).frontmatter.description;
  } catch {
    // Missing or invalid SKILL.md: leave the description undefined.
  }
  return listing;
}

/**
 * Collapse listings to one entry per name, keeping the most recent (entries arrive sorted by
 * version ascending, so the last wins). Used for the default "pick a skill" view.
 */
export function latestPerName(entries: StoreListing[]): StoreListing[] {
  const byName = new Map<string, StoreListing>();
  for (const entry of entries) byName.set(entry.name, entry);
  return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/** Remove a skill version from the store, including its provenance metadata (no error when absent). */
export async function removeFromStore(name: string, version: string, home?: string): Promise<void> {
  await rm(storeSkillDir(name, version, home), { recursive: true, force: true });
  await rm(storeSkillMetaPath(name, version, home), { force: true });
}
