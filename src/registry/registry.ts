/**
 * Orchestration layer: ties sources, store, linker, manifests and lockfiles together.
 * Kept free of CLI/prompt concerns — name-conflict resolution is injected as a callback,
 * so the whole flow is testable headlessly.
 */

import { join } from "node:path";
import { files } from "../constants";
import { installedSkillDir } from "../config/paths";
import {
  readEffectiveLockfile,
  readLockfile,
  readProjectConfig,
  readProjectLock,
  writeLockfile,
  writeProjectLock,
} from "../config/project";
import { installSkill, linkStatus, uninstallSkill } from "../link/link";
import { buildManifest, readManifest, writeManifest } from "../manifest/manifest";
import { setFrontmatterName } from "../skill/frontmatter";
import { parseSkillMd } from "../skill/frontmatter";
import { dedupeName, normalizeName } from "../skill/normalize";
import { validateFrontmatter, validateNameMatchesDir } from "../skill/validate";
import { sourceEquals } from "../sources/equals";
import { fetchSource } from "../sources/fetch";
import { listImporters } from "../plugin/host";
import { getPreset } from "../preset/preset";
import { type StoreEntry, addToStore } from "../store/store";
import type { InstallMode, LockEntry, ProjectConfig, SourceSpec } from "../types";
import { pathExists, readText, writeText } from "../util/fs";
import { hashDir } from "../util/hash";
import { findEntry, removeEntry, upsertEntry } from "./lockEntries";
import { type InstalledSkill, installedNames, scanInstalled } from "./scan";

/** Which lockfiles a skill belongs to. */
export type Scope = "project" | "local";

/** Callback that resolves a final skill name on conflict (injected by the CLI for prompting). */
export type ResolveNameFn = (
  proposed: string,
  context: { declared: string; existing: Set<string> },
) => Promise<string> | string;

/** Load a project's config or fail with a clear message. */
async function requireConfig(projectPath: string, home?: string): Promise<ProjectConfig> {
  const config = await readProjectConfig(projectPath, home);
  if (!config) throw new Error("Project is not initialized. Run 'skillmesh init' first.");
  return config;
}

/** Read and parse the declared skill name from a fetched skill directory. */
async function declaredName(skillDir: string): Promise<string> {
  const content = await readText(join(skillDir, files.skill));
  return parseSkillMd(content).frontmatter.name;
}

/** Pick the final install name: the canonical name, or a deduped one (confirmed via callback) on conflict. */
async function resolveFinalName(
  canonical: string,
  declared: string,
  existing: Set<string>,
  resolveName?: ResolveNameFn,
): Promise<string> {
  if (!existing.has(canonical)) return canonical;
  const proposed = dedupeName(canonical, existing);
  const chosen = resolveName ? await resolveName(proposed, { declared, existing }) : proposed;
  const normalized = normalizeName(chosen);
  return existing.has(normalized) ? dedupeName(normalized, existing) : normalized;
}

/** Rewrite a copied skill's SKILL.md and sidecar so its `name` matches the (renamed) directory. */
async function rewriteInstalledName(skillDir: string, name: string): Promise<void> {
  const skillFile = join(skillDir, files.skill);
  await writeText(skillFile, setFrontmatterName(await readText(skillFile), name));
  const manifest = await readManifest(skillDir);
  if (manifest) await writeManifest(skillDir, { ...manifest, name });
}

/** Persist a lock entry to the home lock (always) and the project lock (when project-scoped & enabled). */
async function persistEntry(
  projectPath: string,
  config: ProjectConfig,
  entry: LockEntry,
  scope: Scope,
  home?: string,
): Promise<void> {
  await writeLockfile(projectPath, upsertEntry(await readLockfile(projectPath, home), entry), home);
  if (config.projectLock && scope === "project") {
    const current = (await readProjectLock(projectPath)) ?? { version: 1, skills: [] };
    await writeProjectLock(projectPath, upsertEntry(current, entry));
  }
}

/** Remove a lock entry from both home and project locks. */
async function dropEntry(projectPath: string, name: string, home?: string): Promise<void> {
  await writeLockfile(projectPath, removeEntry(await readLockfile(projectPath, home), name), home);
  const projectLock = await readProjectLock(projectPath);
  if (projectLock) await writeProjectLock(projectPath, removeEntry(projectLock, name));
}

/**
 * Materialize a store skill into the project under `name`.
 * Renamed skills must be copied (so their SKILL.md `name` can be rewritten to match the directory);
 * otherwise the requested mode is honored. Returns the mode actually used.
 */
async function materialize(
  storePath: string,
  installPath: string,
  declared: string,
  name: string,
  requestedMode: InstallMode,
): Promise<InstallMode> {
  const needsRewrite = declared !== name;
  const mode: InstallMode = needsRewrite ? "copy" : requestedMode;
  await installSkill(storePath, installPath, mode);
  if (needsRewrite) await rewriteInstalledName(installPath, name);
  return mode;
}

/**
 * Mirror a store skill into every configured skills directory, replacing whatever is there.
 * The mode is consistent across dirs (a renamed skill is copied everywhere); returns that mode.
 */
async function materializeAll(
  projectPath: string,
  skillsDirs: string[],
  storePath: string,
  declared: string,
  name: string,
  requestedMode: InstallMode,
): Promise<InstallMode> {
  let mode: InstallMode = requestedMode;
  for (const dir of skillsDirs) {
    const installPath = installedSkillDir(projectPath, dir, name);
    await uninstallSkill(installPath); // idempotent: clears any stale/partial install before relinking
    mode = await materialize(storePath, installPath, declared, name, requestedMode);
  }
  return mode;
}

/** Remove a skill from every configured skills directory (the store cache is left intact). */
async function uninstallAll(projectPath: string, skillsDirs: string[], name: string): Promise<void> {
  for (const dir of skillsDirs) {
    await uninstallSkill(installedSkillDir(projectPath, dir, name));
  }
}

/** Whether a skill name is present (installed or broken) in any configured skills directory. */
async function anyInstalled(
  projectPath: string,
  skillsDirs: string[],
  name: string,
): Promise<boolean> {
  for (const dir of skillsDirs) {
    if ((await linkStatus(installedSkillDir(projectPath, dir, name))) !== "missing") return true;
  }
  return false;
}

/** Result of adding a skill. */
export type AddResult = {
  name: string;
  version: string;
  mode: InstallMode;
  renamedFrom?: string;
};

/** Options for adding a skill. */
export type AddOptions = {
  projectPath: string;
  source: SourceSpec;
  mode?: InstallMode;
  scope?: Scope;
  home?: string;
  resolveName?: ResolveNameFn;
};

/** Add a skill: fetch → store → resolve name → install (link/copy) → record in lockfile(s). */
export async function addSkill(opts: AddOptions): Promise<AddResult> {
  const config = await requireConfig(opts.projectPath, opts.home);

  const lock = await readEffectiveLockfile(opts.projectPath, opts.home);
  const duplicate = lock.skills.find((s) => sourceEquals(s.source, opts.source));
  if (duplicate) {
    throw new Error(`This source is already added as '${duplicate.name}'. Use 'update' instead.`);
  }

  const fetched = await fetchSource(opts.source);
  try {
    const declared = await declaredName(fetched.dir);
    const canonical = normalizeName(declared);

    const manifest = buildManifest({
      name: canonical,
      source: opts.source,
      version: fetched.version,
    });
    const storePath = await addToStore(fetched.dir, manifest, opts.home);
    const integrity = await hashDir(storePath);

    const existing = await installedNames(opts.projectPath, config.skillsDirs);
    const name = await resolveFinalName(canonical, declared, existing, opts.resolveName);

    if (await anyInstalled(opts.projectPath, config.skillsDirs, name)) {
      throw new Error(`A skill named '${name}' is already installed. Use 'update' instead.`);
    }

    const mode = await materializeAll(
      opts.projectPath,
      config.skillsDirs,
      storePath,
      declared,
      name,
      opts.mode ?? config.defaultMode,
    );

    const scope = opts.scope ?? (config.projectLock ? "project" : "local");
    await persistEntry(
      opts.projectPath,
      config,
      { name, source: opts.source, version: fetched.version, mode, integrity },
      scope,
      opts.home,
    );

    const result: AddResult = { name, version: fetched.version, mode };
    if (declared !== name) result.renamedFrom = declared;
    return result;
  } finally {
    await fetched.cleanup();
  }
}

/** Options for installing an already-cached store skill into a project. */
export type AddStoredOptions = {
  projectPath: string;
  entry: StoreEntry;
  mode?: InstallMode;
  scope?: Scope;
  home?: string;
  resolveName?: ResolveNameFn;
};

/**
 * Install a skill that already lives in the global store, without re-fetching it.
 * The content is materialized straight from the cache, but the lock records the skill's original
 * origin source (read from its sidecar manifest) — so provenance and `update` are preserved.
 */
export async function addStoredSkill(opts: AddStoredOptions): Promise<AddResult> {
  const config = await requireConfig(opts.projectPath, opts.home);

  const manifest = await readManifest(opts.entry.path);
  if (!manifest) {
    throw new Error(
      `Cached skill '${opts.entry.name}@${opts.entry.version}' has no manifest; re-add it from its source.`,
    );
  }
  const source = manifest.source;

  const lock = await readEffectiveLockfile(opts.projectPath, opts.home);
  const duplicate = lock.skills.find((s) => sourceEquals(s.source, source));
  if (duplicate) {
    throw new Error(`This source is already added as '${duplicate.name}'. Use 'update' instead.`);
  }

  const declared = await declaredName(opts.entry.path);
  const canonical = normalizeName(declared);

  const existing = await installedNames(opts.projectPath, config.skillsDirs);
  const name = await resolveFinalName(canonical, declared, existing, opts.resolveName);

  if (await anyInstalled(opts.projectPath, config.skillsDirs, name)) {
    throw new Error(`A skill named '${name}' is already installed. Use 'update' instead.`);
  }

  const mode = await materializeAll(
    opts.projectPath,
    config.skillsDirs,
    opts.entry.path,
    declared,
    name,
    opts.mode ?? config.defaultMode,
  );
  const integrity = await hashDir(opts.entry.path);

  const scope = opts.scope ?? (config.projectLock ? "project" : "local");
  await persistEntry(
    opts.projectPath,
    config,
    { name, source, version: opts.entry.version, mode, integrity },
    scope,
    opts.home,
  );

  const result: AddResult = { name, version: opts.entry.version, mode };
  if (declared !== name) result.renamedFrom = declared;
  return result;
}

/** Remove a managed skill from the project and the lockfiles (the store cache is left intact). */
export async function removeSkill(opts: {
  projectPath: string;
  name: string;
  home?: string;
}): Promise<void> {
  const config = await requireConfig(opts.projectPath, opts.home);
  await uninstallAll(opts.projectPath, config.skillsDirs, opts.name);
  await dropEntry(opts.projectPath, opts.name, opts.home);
}

/** Result of updating a skill. */
export type UpdateResult = {
  name: string;
  from: string;
  to: string;
  changed: boolean;
};

/** Update a managed skill from its recorded source, re-installing it under the same name. */
export async function updateSkill(opts: {
  projectPath: string;
  name: string;
  home?: string;
}): Promise<UpdateResult> {
  const config = await requireConfig(opts.projectPath, opts.home);
  const entry = findEntry(await readEffectiveLockfile(opts.projectPath, opts.home), opts.name);
  if (!entry) throw new Error(`Not a managed skill: ${opts.name}`);

  const fetched = await fetchSource(entry.source);
  try {
    const declared = await declaredName(fetched.dir);
    const canonical = normalizeName(declared);
    const storePath = await addToStore(
      fetched.dir,
      buildManifest({ name: canonical, source: entry.source, version: fetched.version }),
      opts.home,
    );
    const integrity = await hashDir(storePath);

    const mode = await materializeAll(
      opts.projectPath,
      config.skillsDirs,
      storePath,
      declared,
      entry.name,
      entry.mode,
    );

    const inProjectLock = (await readProjectLock(opts.projectPath))?.skills.some(
      (s) => s.name === entry.name,
    );
    await persistEntry(
      opts.projectPath,
      config,
      { ...entry, version: fetched.version, integrity, mode },
      inProjectLock ? "project" : "local",
      opts.home,
    );

    return { name: entry.name, from: entry.version, to: fetched.version, changed: integrity !== entry.integrity };
  } finally {
    await fetched.cleanup();
  }
}

/** Outcome of syncing a single skill. */
export type SyncResult = { name: string; action: "ok" | "installed" | "imported" };

/**
 * Install any skills declared in the effective lockfile that are missing/broken in the project.
 * When the project enables `syncImports`, foreign manifests are re-checked first (via enabled plugin
 * importers) so newly declared external sources are pulled in — and recorded in the lockfile — before
 * the lockfile is reconciled. Already-present sources are skipped, keeping the pass idempotent.
 */
export async function syncProject(opts: { projectPath: string; home?: string }): Promise<SyncResult[]> {
  const config = await requireConfig(opts.projectPath, opts.home);

  const results: SyncResult[] = [];
  const imported = new Set<string>();
  if (config.syncImports !== false) {
    const { applied } = await importManifests({
      projectPath: opts.projectPath,
      ...(opts.home ? { home: opts.home } : {}),
    });
    for (const added of applied) {
      results.push({ name: added.name, action: "imported" });
      imported.add(added.name);
    }
  }

  const lock = await readEffectiveLockfile(opts.projectPath, opts.home);
  for (const entry of lock.skills) {
    if (imported.has(entry.name)) continue; // freshly imported and installed by importManifests above

    // A mirrored skill must be present in every configured dir; (re)install if any is missing/broken.
    let needsInstall = false;
    for (const dir of config.skillsDirs) {
      const installPath = installedSkillDir(opts.projectPath, dir, entry.name);
      const status = await linkStatus(installPath);
      if (status === "link" || status === "dir") continue;
      if (status === "broken") await uninstallSkill(installPath);
      needsInstall = true;
    }
    if (!needsInstall) {
      results.push({ name: entry.name, action: "ok" });
      continue;
    }

    const fetched = await fetchSource(entry.source);
    try {
      const declared = await declaredName(fetched.dir);
      const canonical = normalizeName(declared);
      const storePath = await addToStore(
        fetched.dir,
        buildManifest({ name: canonical, source: entry.source, version: fetched.version }),
        opts.home,
      );
      const integrity = await hashDir(storePath);
      const mode = await materializeAll(
        opts.projectPath,
        config.skillsDirs,
        storePath,
        declared,
        entry.name,
        entry.mode,
      );
      await writeLockfile(
        opts.projectPath,
        upsertEntry(await readLockfile(opts.projectPath, opts.home), {
          ...entry,
          version: fetched.version,
          integrity,
          mode,
        }),
        opts.home,
      );
      results.push({ name: entry.name, action: "installed" });
    } finally {
      await fetched.cleanup();
    }
  }
  return results;
}

/** A row describing a skill in the project, for `list`/`status`. */
export type SkillListing = {
  name: string;
  kind: "managed" | "local";
  status: InstalledSkill["status"];
  mode?: InstallMode;
  version?: string;
  source?: SourceSpec;
};

/** List skills in the project: managed (from the lockfile, with status) plus project-local ones. */
export async function listSkills(opts: {
  projectPath: string;
  home?: string;
}): Promise<SkillListing[]> {
  const config = await requireConfig(opts.projectPath, opts.home);
  const lock = await readEffectiveLockfile(opts.projectPath, opts.home);
  const scanned = await scanInstalled(opts.projectPath, config.skillsDirs);
  const byName = new Map(scanned.map((s) => [s.name, s]));

  const out: SkillListing[] = [];
  for (const entry of lock.skills) {
    out.push({
      name: entry.name,
      kind: "managed",
      status: byName.get(entry.name)?.status ?? "missing",
      mode: entry.mode,
      version: entry.version,
      source: entry.source,
    });
    byName.delete(entry.name);
  }
  for (const skill of byName.values()) {
    out.push({ name: skill.name, kind: skill.managed ? "managed" : "local", status: skill.status });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

/** Outcome of applying a preset: skills added, and sources skipped (e.g. already present). */
export type ApplyPresetResult = {
  applied: AddResult[];
  skipped: { source: SourceSpec; reason: string }[];
};

/** Apply a preset by adding each of its sources to the project; already-present sources are skipped. */
export async function applyPreset(opts: {
  projectPath: string;
  preset: string;
  mode?: InstallMode;
  scope?: Scope;
  home?: string;
  resolveName?: ResolveNameFn;
}): Promise<ApplyPresetResult> {
  const preset = await getPreset(opts.preset, opts.home);
  if (!preset) throw new Error(`Preset '${opts.preset}' does not exist`);

  const applied: AddResult[] = [];
  const skipped: { source: SourceSpec; reason: string }[] = [];
  for (const source of preset.sources) {
    try {
      applied.push(
        await addSkill({
          projectPath: opts.projectPath,
          source,
          ...(opts.mode ? { mode: opts.mode } : {}),
          ...(opts.scope ? { scope: opts.scope } : {}),
          ...(opts.home ? { home: opts.home } : {}),
          ...(opts.resolveName ? { resolveName: opts.resolveName } : {}),
        }),
      );
    } catch (err) {
      skipped.push({ source, reason: (err as Error).message });
    }
  }
  return { applied, skipped };
}

/** Outcome of importing foreign manifests via enabled plugin importers. */
export type ImportResult = {
  /** Per-importer breakdown of which sources were discovered. */
  detected: { importer: string; sources: SourceSpec[] }[];
  /** Skills successfully added from the discovered sources. */
  applied: AddResult[];
  /** Sources that could not be added (e.g. already present), with the reason. */
  skipped: { source: SourceSpec; reason: string }[];
};

/**
 * Import skills from foreign project manifests: run every enabled plugin importer that detects a
 * manifest, expand it into sources, and add each (reusing `addSkill`). Already-present sources are
 * skipped rather than failing the whole run.
 */
export async function importManifests(opts: {
  projectPath: string;
  mode?: InstallMode;
  scope?: Scope;
  home?: string;
  resolveName?: ResolveNameFn;
}): Promise<ImportResult> {
  const detected: ImportResult["detected"] = [];
  const applied: AddResult[] = [];
  const skipped: ImportResult["skipped"] = [];

  for (const importer of listImporters()) {
    if (!(await importer.detect(opts.projectPath))) continue;
    const sources = await importer.load(opts.projectPath);
    detected.push({ importer: importer.name, sources });
    for (const source of sources) {
      try {
        applied.push(
          await addSkill({
            projectPath: opts.projectPath,
            source,
            ...(opts.mode ? { mode: opts.mode } : {}),
            ...(opts.scope ? { scope: opts.scope } : {}),
            ...(opts.home ? { home: opts.home } : {}),
            ...(opts.resolveName ? { resolveName: opts.resolveName } : {}),
          }),
        );
      } catch (err) {
        skipped.push({ source, reason: (err as Error).message });
      }
    }
  }
  return { detected, applied, skipped };
}

/** Health report for a project's installed skills versus its lockfile. */
export type DoctorReport = {
  /** Declared in the lockfile and present on disk. */
  ok: string[];
  /** Declared in the lockfile but absent on disk (run `sync`). */
  missing: string[];
  /** Installed as a link whose store target is gone (run `sync`). */
  broken: string[];
  /** Managed skills present on disk but absent from the lockfile. */
  untracked: string[];
  /** Project-local (hand-authored) skills, for information. */
  local: string[];
  /** True when there are no missing/broken/untracked skills. */
  healthy: boolean;
};

/** Diagnose install health: lockfile drift, missing installs and broken links. */
export async function projectStatus(opts: {
  projectPath: string;
  home?: string;
}): Promise<DoctorReport> {
  const config = await requireConfig(opts.projectPath, opts.home);
  const lock = await readEffectiveLockfile(opts.projectPath, opts.home);
  const scanned = await scanInstalled(opts.projectPath, config.skillsDirs);
  const byName = new Map(scanned.map((s) => [s.name, s]));

  const ok: string[] = [];
  const missing: string[] = [];
  const broken: string[] = [];
  for (const entry of lock.skills) {
    byName.delete(entry.name);
    // A mirrored skill is healthy only when present in every configured dir; absence anywhere → sync.
    const statuses = await Promise.all(
      config.skillsDirs.map((dir) =>
        linkStatus(installedSkillDir(opts.projectPath, dir, entry.name)),
      ),
    );
    if (statuses.some((s) => s === "missing")) missing.push(entry.name);
    else if (statuses.some((s) => s === "broken")) broken.push(entry.name);
    else ok.push(entry.name);
  }

  const untracked: string[] = [];
  const local: string[] = [];
  for (const skill of byName.values()) {
    (skill.managed ? untracked : local).push(skill.name);
  }

  const sort = (xs: string[]) => xs.sort((a, b) => a.localeCompare(b));
  return {
    ok: sort(ok),
    missing: sort(missing),
    broken: sort(broken),
    untracked: sort(untracked),
    local: sort(local),
    healthy: missing.length === 0 && broken.length === 0 && untracked.length === 0,
  };
}

/** A skill with one or more validation problems. */
export type ValidationIssue = { name: string; errors: string[] };

/** Validate every installed skill against the agentskills.io spec (and link health). */
export async function validateProject(opts: {
  projectPath: string;
  home?: string;
}): Promise<ValidationIssue[]> {
  const config = await requireConfig(opts.projectPath, opts.home);
  const scanned = await scanInstalled(opts.projectPath, config.skillsDirs);

  const issues: ValidationIssue[] = [];
  for (const skill of scanned) {
    const errors: string[] = [];
    if (skill.status === "broken") {
      issues.push({ name: skill.name, errors: ["broken link (store target is missing)"] });
      continue;
    }
    const skillFile = join(skill.path, files.skill);
    if (!(await pathExists(skillFile))) {
      errors.push(`missing ${files.skill}`);
    } else {
      try {
        const { frontmatter } = parseSkillMd(await readText(skillFile));
        errors.push(...validateFrontmatter(frontmatter));
        errors.push(...validateNameMatchesDir(frontmatter.name, skill.name));
      } catch (err) {
        errors.push((err as Error).message);
      }
    }
    if (errors.length > 0) issues.push({ name: skill.name, errors });
  }
  return issues;
}
