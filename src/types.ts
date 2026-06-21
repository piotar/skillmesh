/**
 * Core domain types shared across skillmesh domains.
 * Kept dependency-free so any domain can import them without cycles.
 */

/** How a skill is materialized into a project: a filesystem link or a full copy. */
export type InstallMode = "link" | "copy";

/** Where a skill originates from. Drives both installation and updates. */
export type SourceType = "git" | "local" | "npm" | "github" | "tarball" | "plugin";

/** A skill pulled from a git repository (optionally a ref and a subdirectory). */
export type GitSource = {
  type: "git";
  url: string;
  ref?: string;
  subpath?: string;
};

/** A skill provided from a local filesystem path. */
export type LocalSource = {
  type: "local";
  path: string;
};

/** A skill distributed as an npm package (optionally a version and a subdirectory). */
export type NpmSource = {
  type: "npm";
  package: string;
  version?: string;
  subpath?: string;
};

/** A skill from a GitHub shorthand (`owner/repo`), optionally a ref and subdirectory. */
export type GithubSource = {
  type: "github";
  repo: string;
  ref?: string;
  subpath?: string;
};

/** A skill packaged as a downloadable tar/zip archive. */
export type TarballSource = {
  type: "tarball";
  url: string;
  subpath?: string;
};

/** A skill resolved by a plugin-provided source adapter. The opaque `payload` is the
 *  adapter's own parsed form; only the owning adapter (keyed by `adapter`) interprets it. */
export type PluginSource = {
  type: "plugin";
  /** The id (SourceAdapter.type) of the adapter that owns this source. */
  adapter: string;
  payload: Record<string, unknown>;
};

/** Any supported skill source, discriminated by `type`. */
export type SourceSpec =
  | GitSource
  | LocalSource
  | NpmSource
  | GithubSource
  | TarballSource
  | PluginSource;

/** Typed view of a SKILL.md YAML frontmatter (agentskills.io spec). */
export type SkillFrontmatter = {
  name: string;
  description: string;
  license?: string;
  compatibility?: string;
  metadata?: Record<string, string>;
  /** Maps to the `allowed-tools` frontmatter field. */
  allowedTools?: string;
};

/** Sidecar manifest written inside a managed skill (`.skillmesh.json`).
 *  Its presence is what distinguishes a managed skill from a project-local one. */
export type SkillManifest = {
  name: string;
  source: SourceSpec;
  /** Resolved version identity used for updates (git commit, content hash, …). */
  version: string;
  installedAt: string;
};

/** A single entry in the project lockfile. */
export type LockEntry = {
  name: string;
  source: SourceSpec;
  version: string;
  mode: InstallMode;
  /** Content hash for drift detection. */
  integrity: string;
};

/** Deterministic record of every managed skill in a project. */
export type Lockfile = {
  version: number;
  skills: LockEntry[];
};

/** Per-project configuration (stored in home, keyed by project path). */
export type ProjectConfig = {
  version: number;
  /** Directories (relative to the project root) where skills are installed; a managed skill is
   *  mirrored into every one of them (one per agent, e.g. `.claude/skills`, `.codex/skills`). */
  skillsDirs: string[];
  defaultMode: InstallMode;
  /** When true, a committed lockfile is also maintained in the project root for team/CI reproducibility. */
  projectLock: boolean;
  /** When true, `sync` first re-checks foreign manifests via enabled plugin importers, pulling in any
   *  newly declared external sources before reconciling the lockfile. Defaults to on. */
  syncImports: boolean;
};

/** A named set of skill sources that can be applied to a project at once. */
export type Preset = {
  name: string;
  sources: SourceSpec[];
};

/** Global configuration (`~/.skillmesh/config.json`). */
export type GlobalConfig = {
  version: number;
  presets: Record<string, Preset>;
};
