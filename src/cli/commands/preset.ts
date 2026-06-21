/** `skillmesh preset …` — manage named sets of skill sources and apply them to a project. */

import { defineCommand } from "citty";
import * as p from "@clack/prompts";
import { resolveActiveProject } from "../../config/global";
import { applyPreset } from "../../registry/registry";
import {
  addSourceToPreset,
  createPreset,
  getPreset,
  listPresets,
  removePreset,
  removeSourceFromPreset,
} from "../../preset/preset";
import { sourceEquals } from "../../sources/equals";
import { parseSource } from "../../sources/resolve";
import { type StoreListing, listStoreEntries } from "../../store/store";
import { pickCachedSkills } from "../cachePicker";
import { describeSource } from "../describeSource";
import { interactiveResolveName } from "../prompts";
import { parseMode, withOverrides } from "../sourceArgs";
import type { SourceSpec } from "../../types";

/** Display label for a source: the cached frontmatter name (when known) plus its origin. */
function sourceLabel(source: SourceSpec, cached: StoreListing[]): string {
  const name = cached.find((e) => e.source && sourceEquals(e.source, source))?.name;
  return name ? `${name}  (${describeSource(source)})` : describeSource(source);
}

/** Prompt the user to choose one or more of a preset's current sources (backs interactive `remove`). */
async function pickPresetSources(name: string): Promise<SourceSpec[]> {
  if (!process.stdout.isTTY) {
    throw new Error("No source given and not attached to a terminal — pass a source explicitly.");
  }
  const preset = await getPreset(name);
  if (!preset) throw new Error(`Preset '${name}' does not exist`);
  if (preset.sources.length === 0) throw new Error(`Preset '${name}' is empty.`);

  const cached = await listStoreEntries();
  // Use the index as the option value: SourceSpec is a discriminated union, which clack's Option
  // type distributes over and rejects; a primitive index sidesteps that.
  const answer = await p.multiselect({
    message: `Select sources to remove from '${name}'`,
    options: preset.sources.map((source, i) => ({ value: i, label: sourceLabel(source, cached) })),
    required: true,
  });
  if (p.isCancel(answer)) {
    p.cancel("Aborted.");
    process.exit(1);
  }
  return answer.map((i) => preset.sources[i]!);
}

const listSub = defineCommand({
  meta: { name: "list", description: "List presets and their sources" },
  async run() {
    const presets = await listPresets();
    p.intro("skillmesh preset list");
    if (presets.length === 0) {
      p.outro("No presets defined.");
      return;
    }
    // Resolve each source's frontmatter name from the cache (when the skill has been fetched).
    const cached = await listStoreEntries();
    for (const preset of presets) {
      const body =
        preset.sources.length > 0
          ? preset.sources.map((s) => `- ${sourceLabel(s, cached)}`).join("\n")
          : "(empty)";
      p.note(body, preset.name);
    }
    p.outro(`${presets.length} preset(s)`);
  },
});

const createSub = defineCommand({
  meta: { name: "create", description: "Create a new empty preset" },
  args: { name: { type: "positional", required: true, description: "Preset name" } },
  async run({ args }) {
    await createPreset(args.name);
    p.log.success(`Created preset '${args.name}'`);
  },
});

const addSub = defineCommand({
  meta: { name: "add", description: "Add a source to a preset (creates the preset if needed)" },
  args: {
    name: { type: "positional", required: true, description: "Preset name" },
    source: { type: "positional", required: false, description: "Skill source (omit to pick from cache)" },
    ref: { type: "string", description: "Git/GitHub ref" },
    path: { type: "string", description: "Subdirectory within the source" },
  },
  async run({ args }) {
    // No source given: pick one or more cached skills and add their origin sources to the preset.
    if (!args.source) {
      const picks = await pickCachedSkills({ multiple: true });
      for (const pick of picks) {
        await addSourceToPreset(args.name, pick.source);
        p.log.success(`Added ${describeSource(pick.source)} to '${args.name}'`);
      }
      return;
    }

    const source = withOverrides(parseSource(args.source), args.ref, args.path);
    await addSourceToPreset(args.name, source);
    p.log.success(`Added ${describeSource(source)} to '${args.name}'`);
  },
});

const removeSub = defineCommand({
  meta: { name: "remove", description: "Remove sources from a preset (omit source to pick interactively)" },
  args: {
    name: { type: "positional", required: true, description: "Preset name" },
    source: { type: "positional", required: false, description: "Skill source to remove (omit to pick)" },
    ref: { type: "string", description: "Git/GitHub ref" },
    path: { type: "string", description: "Subdirectory within the source" },
  },
  async run({ args }) {
    // No source given: pick one or more of the preset's current sources to remove.
    if (!args.source) {
      for (const source of await pickPresetSources(args.name)) {
        await removeSourceFromPreset(args.name, source);
        p.log.success(`Removed ${describeSource(source)} from '${args.name}'`);
      }
      return;
    }

    const source = withOverrides(parseSource(args.source), args.ref, args.path);
    const preset = await removeSourceFromPreset(args.name, source);
    if (preset.sources.some((s) => sourceEquals(s, source))) {
      p.log.warn(`Source not found in preset '${args.name}'`);
    } else {
      p.log.success(`Removed ${describeSource(source)} from '${args.name}'`);
    }
  },
});

const deleteSub = defineCommand({
  meta: { name: "delete", description: "Delete a preset" },
  args: { name: { type: "positional", required: true, description: "Preset name" } },
  async run({ args }) {
    await removePreset(args.name);
    p.log.success(`Deleted preset '${args.name}'`);
  },
});

const applySub = defineCommand({
  meta: { name: "apply", description: "Add all of a preset's skills to the active project" },
  args: {
    name: { type: "positional", required: true, description: "Preset name" },
    mode: { type: "string", description: "Install mode: 'link' (default) or 'copy'" },
    local: { type: "boolean", description: "Keep added skills local-only" },
  },
  async run({ args }) {
    const projectPath = await resolveActiveProject();
    const mode = parseMode(args.mode);

    p.intro(`skillmesh preset apply ${args.name}`);
    const result = await applyPreset({
      projectPath,
      preset: args.name,
      ...(mode ? { mode } : {}),
      ...(args.local ? { scope: "local" as const } : {}),
      resolveName: interactiveResolveName,
    });

    for (const added of result.applied) p.log.success(`Added '${added.name}' (${added.mode})`);
    for (const skip of result.skipped) {
      p.log.warn(`Skipped ${describeSource(skip.source)}: ${skip.reason}`);
    }
    p.outro(`Applied ${result.applied.length}, skipped ${result.skipped.length}.`);
  },
});

export const presetCommand = defineCommand({
  meta: { name: "preset", description: "Manage and apply presets (named sets of skills)" },
  subCommands: {
    list: listSub,
    create: createSub,
    add: addSub,
    remove: removeSub,
    delete: deleteSub,
    apply: applySub,
  },
});
