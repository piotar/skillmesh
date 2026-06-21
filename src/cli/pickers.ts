/**
 * Interactive target pickers shared across commands. The convention everywhere: when a command's
 * target (skill / preset / plugin) is omitted on the CLI, prompt for it; when not on a TTY, throw
 * with a message telling the user to pass it explicitly. Backs `remove`, `cache remove`,
 * `preset apply|delete|remove` and `plugin enable|disable|remove` (the cache/source pickers for
 * `add` and `preset add|remove` live in cachePicker.ts and preset.ts).
 */

import * as p from "@clack/prompts";
import { listPlugins } from "../plugin/manage";
import { listPresets } from "../preset/preset";
import { listSkills } from "../registry/registry";
import { listStoreEntries } from "../store/store";

/** Guard interactive pickers: a missing target on a non-TTY is a hard error, not a prompt. */
export function requireTty(what: string): void {
  if (!process.stdout.isTTY) {
    throw new Error(`No ${what} given and not attached to a terminal — pass one explicitly.`);
  }
}

/** Resolve a clack answer, exiting cleanly on cancel (Ctrl-C / Esc). */
function unwrap<T>(answer: T | symbol): T {
  if (p.isCancel(answer)) {
    p.cancel("Aborted.");
    process.exit(1);
  }
  return answer;
}

/** Pick one or more managed skills installed in the active project (backs `remove`). */
export async function pickInstalledSkills(projectPath: string): Promise<string[]> {
  requireTty("skill");
  const managed = (await listSkills({ projectPath })).filter((s) => s.kind === "managed");
  if (managed.length === 0) {
    throw new Error("No managed skills installed in this project. Add one with 'skillmesh add <source>'.");
  }
  return unwrap(
    await p.multiselect({
      message: "Select skills to remove",
      options: managed.map((s) => ({ value: s.name, label: s.name, hint: s.status })),
      required: true,
    }),
  );
}

/** Pick one or more cached skill names (each removes all of its versions) — backs `cache remove`. */
export async function pickCachedNames(): Promise<string[]> {
  requireTty("skill");
  const names = [...new Set((await listStoreEntries()).map((e) => e.name))].sort();
  if (names.length === 0) throw new Error("Cache is empty. Nothing to remove.");
  return unwrap(
    await p.multiselect({
      message: "Select cached skills to remove (all versions)",
      options: names.map((n) => ({ value: n, label: n })),
      required: true,
    }),
  );
}

/** Pick a single preset by name (backs `preset apply|delete`, and `preset add|remove` when no name is given). */
export async function pickPreset(message: string): Promise<string> {
  requireTty("preset");
  const presets = await listPresets();
  if (presets.length === 0) {
    throw new Error("No presets defined. Create one with 'skillmesh preset create <name>'.");
  }
  return unwrap(
    await p.select({
      message,
      options: presets.map((pr) => ({ value: pr.name, label: pr.name, hint: `${pr.sources.length} source(s)` })),
    }),
  );
}

/** Pick one or more installed plugins, optionally filtered by state — backs plugin enable/disable/remove. */
export async function pickPlugins(message: string, filter?: "enabled" | "disabled"): Promise<string[]> {
  requireTty("plugin");
  const plugins = (await listPlugins()).filter(
    (pl) => !filter || (filter === "enabled" ? pl.enabled : !pl.enabled),
  );
  if (plugins.length === 0) throw new Error(`No ${filter ?? "installed"} plugins.`);
  return unwrap(
    await p.multiselect({
      message,
      options: plugins.map((pl) => ({ value: pl.name, label: pl.name, hint: pl.enabled ? "enabled" : "disabled" })),
      required: true,
    }),
  );
}
