/** Centralized names and defaults so paths/IDs are defined in exactly one place. */

import type { InstallMode } from "./types";
import * as pjson from '../package.json' with { type: 'json' }

/** The published npm package name, and single source of truth for the CLI version. */
export const pkg = {
  /** npm package name; used by self-update to query the registry and install globally. */
  name: pjson.name,
  /** Current version; surfaced in the CLI banner and compared against npm by self-update. */
  version: pjson.version,
} as const;

/** Environment variables that override default locations. */
export const envVars = {
  /** Overrides the global home directory (store + global config). */
  home: "SKILLMESH_HOME",
  /** Overrides the active project path. */
  project: "SKILLMESH_PROJECT",
  /** When set (truthy), suppresses the "update available" notice (the auto-upgrade fallback). */
  skipUpdateCheck: "SKILLMESH_NO_UPDATE_CHECK",
  /** When set (truthy), opts OUT of the default startup auto-upgrade (notice only). */
  noAutoUpgrade: "SKILLMESH_NO_AUTO_UPGRADE",
  /** Internal: set on the re-exec'd child so auto-upgrade runs at most once per invocation. */
  upgradeGuard: "SKILLMESH_UPGRADED",
} as const;

/** Subdirectories inside the global home. */
export const dirs = {
  /** Content store of fetched skills. */
  store: "store",
  /** Per-project state, keyed by the encoded project path. */
  projects: "projects",
  /** Installed plugins, keyed by `name@version` (ecosystem-wide, not per-project). */
  plugins: "plugins",
} as const;

/** The plugin API version this build speaks; plugins declaring a different one are skipped. */
export const pluginApiVersion = 1;

/** Well-known file names used by skillmesh. */
export const files = {
  /** Per-project config, stored in home under the project's state directory. */
  projectConfig: "config.json",
  /** Per-project lockfile, stored in home under the project's state directory. */
  lockfile: "lock.json",
  /** Opt-in committed lockfile written to the project root for team/CI reproducibility. */
  projectRootLock: "skillmesh.lock.json",
  /** Sidecar manifest written inside a managed skill directory. */
  sidecar: ".skillmesh.json",
  /** The required skill entry file per the agentskills.io spec. */
  skill: "SKILL.md",
  /** Throttle cache for the startup update check (stored in home). */
  updateCheck: "update-check.json",
  /** Registry of installed plugins (enabled state + source), stored in home. */
  pluginsRegistry: "plugins.json",
  /** Per-host credentials for private sources (stored in home, never in a project). */
  auth: "auth.json",
  /** A plugin package's manifest field carrier (package.json with a `skillmesh` field). */
  packageJson: "package.json",
} as const;

/**
 * Conventional project skills directory for known agent platforms.
 * The SKILL.md format is portable, so the same skill can be mirrored into each — `init` offers
 * these as presets and `.agents/skills` is the cross-agent alias read by Codex, Gemini and Cursor.
 */
export const skillTargets = {
  /** Claude Code. */
  claude: ".claude/skills",
  /** OpenAI Codex CLI (also reads .agents/skills). */
  codex: ".codex/skills",
  /** Gemini CLI (also reads .agents/skills, which takes precedence). */
  gemini: ".gemini/skills",
  /** JetBrains Junie (IDE plugin + CLI), project scope. */
  junie: ".junie/skills",
  /** Cross-agent interoperable alias, read by Codex, Gemini and Cursor. */
  agents: ".agents/skills",
} as const;

/** A known platform key (`init` preset). */
export type SkillTarget = keyof typeof skillTargets;

/** Default values applied when a project is initialized. */
export const defaults = {
  skillsDirs: [skillTargets.claude],
  mode: "link",
} satisfies { skillsDirs: string[]; mode: InstallMode };
