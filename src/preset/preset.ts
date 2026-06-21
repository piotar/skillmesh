/**
 * Presets: named sets of skill sources stored in the global config.
 * One source can belong to several presets. Applying a preset adds its skills to a project
 * (orchestration lives in the registry; this module only manages preset definitions).
 */

import { readGlobalConfig, writeGlobalConfig } from "../config/global";
import { sourceEquals } from "../sources/equals";
import type { Preset, SourceSpec } from "../types";

/** Persist a single preset into the global config (overwriting any existing entry of that name). */
async function savePreset(preset: Preset, home?: string): Promise<Preset> {
  const config = await readGlobalConfig(home);
  await writeGlobalConfig(
    { ...config, presets: { ...config.presets, [preset.name]: preset } },
    home,
  );
  return preset;
}

/** List all presets, sorted by name. */
export async function listPresets(home?: string): Promise<Preset[]> {
  const config = await readGlobalConfig(home);
  return Object.values(config.presets).sort((a, b) => a.name.localeCompare(b.name));
}

/** Get a preset by name, or null when it does not exist. */
export async function getPreset(name: string, home?: string): Promise<Preset | null> {
  return (await readGlobalConfig(home)).presets[name] ?? null;
}

/** Create an empty preset; throws if one with the same name already exists. */
export async function createPreset(name: string, home?: string): Promise<Preset> {
  if (await getPreset(name, home)) throw new Error(`Preset '${name}' already exists`);
  return savePreset({ name, sources: [] }, home);
}

/** Add a source to a preset (creating the preset on demand), ignoring duplicates. */
export async function addSourceToPreset(
  name: string,
  source: SourceSpec,
  home?: string,
): Promise<Preset> {
  const existing = (await getPreset(name, home)) ?? { name, sources: [] };
  const sources = existing.sources.some((s) => sourceEquals(s, source))
    ? existing.sources
    : [...existing.sources, source];
  return savePreset({ name, sources }, home);
}

/** Remove a source from a preset; throws if the preset does not exist. */
export async function removeSourceFromPreset(
  name: string,
  source: SourceSpec,
  home?: string,
): Promise<Preset> {
  const existing = await getPreset(name, home);
  if (!existing) throw new Error(`Preset '${name}' does not exist`);
  return savePreset(
    { name, sources: existing.sources.filter((s) => !sourceEquals(s, source)) },
    home,
  );
}

/** Delete a preset entirely; a no-op when it does not exist. */
export async function removePreset(name: string, home?: string): Promise<void> {
  const config = await readGlobalConfig(home);
  if (!config.presets[name]) return;
  const { [name]: _removed, ...rest } = config.presets;
  await writeGlobalConfig({ ...config, presets: rest }, home);
}
