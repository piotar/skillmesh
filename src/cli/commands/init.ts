/** `skillmesh init` — initialize a project: write its config into home and prepare the skills dir. */

import { defineCommand } from "citty";
import * as p from "@clack/prompts";
import { isAbsolute, resolve } from "node:path";
import { defaults, envVars, skillTargets, type SkillTarget } from "../../constants";
import { projectStateDir } from "../../config/paths";
import { defaultProjectConfig, readProjectConfig, writeProjectConfig } from "../../config/project";
import type { InstallMode, ProjectConfig } from "../../types";

/** Coerce a raw mode string into a valid InstallMode, or undefined when invalid/absent. */
function parseMode(value: string | undefined): InstallMode | undefined {
  return value === "link" || value === "copy" ? value : undefined;
}

export const initCommand = defineCommand({
  meta: { name: "init", description: "Initialize the current project for skillmesh" },
  args: {
    dir: {
      type: "positional",
      required: false,
      description: "Project directory to initialize (default: current directory)",
    },
    "skills-dir": {
      type: "string",
      description: `Comma-separated dirs where skills are installed/mirrored (default: ${defaults.skillsDirs.join(",")})`,
    },
    mode: {
      type: "string",
      description: "Default install mode: 'link' or 'copy'",
    },
    "project-lock": {
      type: "boolean",
      description: "Also maintain a committed lockfile in the project root (team/CI reproducibility)",
    },
    "sync-imports": {
      type: "boolean",
      description: "On 'sync', re-check foreign manifests via enabled plugins and import new sources",
    },
    yes: {
      type: "boolean",
      alias: "y",
      description: "Accept defaults without prompting",
    },
  },
  async run({ args }) {
    // Target: explicit dir arg → SKILLMESH_PROJECT override → cwd (matching how every other command
    // resolves the active project).
    const fromEnv = process.env[envVars.project]?.trim();
    const projectPath = resolve(args.dir ?? (fromEnv || process.cwd()));
    p.intro("skillmesh init");

    const existing = await readProjectConfig(projectPath);
    if (existing && !args.yes) {
      const overwrite = await p.confirm({
        message: `${projectPath} is already initialized. Overwrite skillmesh.json?`,
        initialValue: false,
      });
      if (p.isCancel(overwrite) || !overwrite) {
        p.cancel("Left existing configuration untouched.");
        return;
      }
    }

    const defaultConfig = defaultProjectConfig();

    const skillsDirs = await resolveSkillsDirs(args["skills-dir"], defaultConfig.skillsDirs, args.yes);
    if (skillsDirs === null) {
      p.cancel("Aborted.");
      return;
    }

    const mode = await resolveMode(args.mode, defaultConfig.defaultMode, args.yes);
    if (mode === null) {
      p.cancel("Aborted.");
      return;
    }

    const projectLock = await resolveProjectLock(
      args["project-lock"],
      defaultConfig.projectLock,
      args.yes,
    );
    if (projectLock === null) {
      p.cancel("Aborted.");
      return;
    }

    const syncImports = await resolveSyncImports(
      args["sync-imports"],
      defaultConfig.syncImports,
      args.yes,
    );
    if (syncImports === null) {
      p.cancel("Aborted.");
      return;
    }

    const config: ProjectConfig = {
      version: defaultConfig.version,
      skillsDirs,
      defaultMode: mode,
      projectLock,
      syncImports,
    };
    await writeProjectConfig(projectPath, config);

    p.outro(
      `Registered ${projectPath}\n` +
        `  state: ${projectStateDir(projectPath)} (nothing written into the project yet)\n` +
        `  skills dirs: ${skillsDirs.join(", ")} (created on first 'add')\n` +
        `  default mode: ${mode}\n` +
        `  project lock: ${projectLock ? "skillmesh.lock.json (committed)" : "off"}\n` +
        `  sync imports: ${syncImports ? "on (re-check foreign manifests)" : "off"}`,
    );
  },
});

/** Split a comma-separated dir list into normalized, de-duplicated relative paths. */
function parseDirList(input: string): string[] {
  const dirs = input
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map(normalizeRelative);
  return [...new Set(dirs)];
}

/**
 * Resolve the set of skills directories: the `--skills-dir` flag (comma-separated), or a prompt that
 * offers the known agent platforms as presets plus any extra custom dirs. Skills are mirrored into
 * every returned dir. Returns null on cancel.
 */
async function resolveSkillsDirs(
  flag: string | undefined,
  fallback: string[],
  yes: boolean | undefined,
): Promise<string[] | null> {
  if (flag) {
    const dirs = parseDirList(flag);
    if (dirs.length === 0) throw new Error("--skills-dir must list at least one directory");
    return dirs;
  }
  if (yes) return fallback;

  const selected = await p.multiselect({
    message: "Which agents should receive skills? (each managed skill is mirrored into all of them)",
    initialValues: ["claude"] as SkillTarget[],
    required: false,
    options: (Object.keys(skillTargets) as SkillTarget[]).map((key) => ({
      value: key,
      label: key,
      hint: skillTargets[key],
    })),
  });
  if (p.isCancel(selected)) return null;
  const dirs: string[] = selected.map((key) => skillTargets[key]);

  const custom = await p.text({
    message: "Extra custom directories? (comma-separated, optional)",
    placeholder: "e.g. .agents/skills, vendor/skills",
  });
  if (p.isCancel(custom)) return null;
  if (custom) dirs.push(...parseDirList(custom));

  const unique = [...new Set(dirs)];
  return unique.length > 0 ? unique : fallback;
}

/** Resolve the default install mode from the flag, a prompt, or the default. Returns null on cancel. */
async function resolveMode(
  flag: string | undefined,
  fallback: InstallMode,
  yes: boolean | undefined,
): Promise<InstallMode | null> {
  if (flag) {
    const parsed = parseMode(flag);
    if (!parsed) throw new Error(`Invalid --mode '${flag}'. Expected 'link' or 'copy'.`);
    return parsed;
  }
  if (yes) return fallback;

  const answer = await p.select({
    message: "Default install mode?",
    initialValue: fallback,
    options: [
      { value: "link" as const, label: "link", hint: "symlink/junction from the shared store" },
      { value: "copy" as const, label: "copy", hint: "independent copy in the project" },
    ],
  });
  if (p.isCancel(answer)) return null;
  return answer;
}

/** Resolve whether to maintain a committed project-root lock, from flag/prompt/default. Returns null on cancel. */
async function resolveProjectLock(
  flag: boolean | undefined,
  fallback: boolean,
  yes: boolean | undefined,
): Promise<boolean | null> {
  if (flag !== undefined) return flag;
  if (yes) return fallback;

  const answer = await p.confirm({
    message: "Maintain a committed lockfile in the project root (for team/CI)?",
    initialValue: fallback,
  });
  if (p.isCancel(answer)) return null;
  return answer;
}

/** Resolve whether `sync` re-checks foreign manifests, from flag/prompt/default. Returns null on cancel. */
async function resolveSyncImports(
  flag: boolean | undefined,
  fallback: boolean,
  yes: boolean | undefined,
): Promise<boolean | null> {
  if (flag !== undefined) return flag;
  if (yes) return fallback;

  const answer = await p.confirm({
    message: "On 'sync', re-check foreign manifests via enabled plugins and import new sources?",
    initialValue: fallback,
  });
  if (p.isCancel(answer)) return null;
  return answer;
}

/** Keep skills-dir as a project-relative path, rejecting absolute paths. */
function normalizeRelative(input: string): string {
  if (isAbsolute(input)) {
    throw new Error("skills-dir must be a relative path inside the project");
  }
  return input.replace(/\\/g, "/").replace(/\/+$/g, "");
}
