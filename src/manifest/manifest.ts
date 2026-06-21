/**
 * The sidecar manifest (`.skillmesh.json`) written inside a managed skill directory.
 * Its presence is what distinguishes a skillmesh-managed skill from a project-local one.
 */

import { join } from "node:path";
import { rm } from "node:fs/promises";
import { files } from "../constants";
import type { SkillManifest } from "../types";
import { pathExists, readJson, writeJson } from "../util/fs";

/** Path to a skill's sidecar manifest. */
export function sidecarPath(skillDir: string): string {
  return join(skillDir, files.sidecar);
}

/** Read a skill's sidecar manifest, or null when the skill is not managed. */
export async function readManifest(skillDir: string): Promise<SkillManifest | null> {
  return readJson<SkillManifest>(sidecarPath(skillDir));
}

/** Write a skill's sidecar manifest. */
export async function writeManifest(skillDir: string, manifest: SkillManifest): Promise<void> {
  await writeJson(sidecarPath(skillDir), manifest);
}

/** Whether a skill directory is managed by skillmesh (has a sidecar manifest). */
export async function isManaged(skillDir: string): Promise<boolean> {
  return pathExists(sidecarPath(skillDir));
}

/** Remove a skill's sidecar manifest if present (no error when absent). */
export async function removeManifest(skillDir: string): Promise<void> {
  await rm(sidecarPath(skillDir), { force: true });
}

/** Build a sidecar manifest, stamping the current install time. */
export function buildManifest(input: Omit<SkillManifest, "installedAt">): SkillManifest {
  return { ...input, installedAt: new Date().toISOString() };
}
