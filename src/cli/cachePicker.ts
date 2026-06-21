/** Interactive selection of skills from the global store (cache); backs `add` and `preset add`. */

import * as p from "@clack/prompts";
import { type StoreEntry, latestPerName, listStoreEntries } from "../store/store";
import type { SourceSpec } from "../types";
import { describeSource } from "./describeSource";

/** A cached skill the user picked: a store entry with its origin source resolved. */
export type CachedPick = StoreEntry & { source: SourceSpec; description?: string };

/** Options for the cache picker. */
export type PickOptions = { home?: string; multiple?: boolean };

/**
 * Prompt the user to choose skills from the cache, returning the selected entries (each with its
 * origin source resolved from the sidecar manifest). Only entries that carry a source — i.e. can be
 * reinstalled — are offered. Throws (rather than prompting) when not on a TTY or the cache is empty.
 */
export async function pickCachedSkills(opts: PickOptions = {}): Promise<CachedPick[]> {
  if (!process.stdout.isTTY) {
    throw new Error("No source given and not attached to a terminal — pass a source explicitly.");
  }

  const all = latestPerName(await listStoreEntries(opts.home));
  const installable: CachedPick[] = all.flatMap((e) =>
    e.source ? [{ name: e.name, version: e.version, path: e.path, source: e.source, ...(e.description ? { description: e.description } : {}) }] : [],
  );
  if (installable.length === 0) {
    throw new Error(
      "No cached skills to choose from. Add one from a source first (e.g. 'skillmesh add <source>').",
    );
  }

  const options = installable.map((entry) => ({
    value: entry,
    label: `${entry.name}  (${entry.version.slice(0, 12)})`,
    hint: entry.description ?? describeSource(entry.source),
  }));

  const answer = opts.multiple
    ? await p.multiselect({ message: "Select skills from the cache", options, required: true })
    : await p.select({ message: "Select a skill from the cache", options });

  if (p.isCancel(answer)) {
    p.cancel("Aborted.");
    process.exit(1);
  }
  return Array.isArray(answer) ? answer : [answer];
}
