/** `skillmesh cache …` — inspect and prune the global store of cached skills (shared across projects). */

import { defineCommand } from "citty";
import * as p from "@clack/prompts";
import { type StoreListing, listStoreEntries, removeFromStore } from "../../store/store";
import { describeSource } from "../describeSource";
import { pickCachedNames } from "../pickers";

/** Group listings by skill name, preserving the input's version ordering. */
function groupByName(entries: StoreListing[]): Map<string, StoreListing[]> {
  const byName = new Map<string, StoreListing[]>();
  for (const entry of entries) {
    const versions = byName.get(entry.name) ?? [];
    versions.push(entry);
    byName.set(entry.name, versions);
  }
  return byName;
}

const listSub = defineCommand({
  meta: { name: "list", description: "List every cached skill across all projects (the global store)" },
  async run() {
    const entries = await listStoreEntries();
    p.intro("skillmesh cache list");
    if (entries.length === 0) {
      p.outro("Cache is empty. Add a skill with 'skillmesh add <source>'.");
      return;
    }

    const byName = groupByName(entries);
    for (const [name, versions] of [...byName.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
      const body = versions
        .map((v) => `- ${v.version.slice(0, 12)}  ${v.source ? describeSource(v.source) : "—"}`)
        .join("\n");
      p.note(body, name);
    }
    p.outro(`${byName.size} skill(s), ${entries.length} version(s) cached.`);
  },
});

/** Parse a `name` or `name@version` target into its parts. */
function parseTarget(skill: string): { name: string; version?: string } {
  const at = skill.lastIndexOf("@");
  return at > 0 ? { name: skill.slice(0, at), version: skill.slice(at + 1) } : { name: skill };
}

const removeSub = defineCommand({
  meta: { name: "remove", description: "Remove cached skills from the store (by name or name@version; omit to pick)" },
  args: {
    skill: { type: "positional", required: false, description: "Skill name, or name@version (omit to pick interactively)" },
  },
  async run({ args }) {
    // Omit the target → multi-select cached skill names (each removes all of its versions).
    const targets: { name: string; version?: string }[] = args.skill
      ? [parseTarget(args.skill)]
      : (await pickCachedNames()).map((name) => ({ name }));

    const entries = await listStoreEntries();
    for (const { name, version } of targets) {
      const matches = entries.filter((e) => e.name === name && (version === undefined || e.version === version));
      if (matches.length === 0) {
        p.log.warn(`No cached skill matches '${version ? `${name}@${version}` : name}'.`);
        continue;
      }
      for (const match of matches) await removeFromStore(match.name, match.version);
      p.log.success(`Removed ${matches.length} cached version(s) of '${name}'.`);
    }
  },
});

export const cacheCommand = defineCommand({
  meta: { name: "cache", description: "Inspect and prune the global skill cache (the store)" },
  subCommands: { list: listSub, remove: removeSub },
});
