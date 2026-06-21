/** `skillmesh cache …` — inspect and prune the global store of cached skills (shared across projects). */

import { defineCommand } from "citty";
import * as p from "@clack/prompts";
import { type StoreListing, listStoreEntries, removeFromStore } from "../../store/store";
import { describeSource } from "../describeSource";

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

const removeSub = defineCommand({
  meta: { name: "remove", description: "Remove a cached skill from the store (by name, or name@version)" },
  args: {
    skill: { type: "positional", required: true, description: "Skill name, or name@version to target one version" },
  },
  async run({ args }) {
    const at = args.skill.lastIndexOf("@");
    const hasVersion = at > 0;
    const name = hasVersion ? args.skill.slice(0, at) : args.skill;
    const version = hasVersion ? args.skill.slice(at + 1) : undefined;

    const matches = (await listStoreEntries()).filter(
      (e) => e.name === name && (version === undefined || e.version === version),
    );
    if (matches.length === 0) {
      p.log.warn(`No cached skill matches '${args.skill}'.`);
      return;
    }

    for (const match of matches) await removeFromStore(match.name, match.version);
    p.log.success(`Removed ${matches.length} cached version(s) of '${name}'.`);
  },
});

export const cacheCommand = defineCommand({
  meta: { name: "cache", description: "Inspect and prune the global skill cache (the store)" },
  subCommands: { list: listSub, remove: removeSub },
});
