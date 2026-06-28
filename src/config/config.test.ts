import { afterAll, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { envVars } from "../constants";
import { pathExists } from "../util/fs";
import { readGlobalConfig, resolveActiveProject, writeGlobalConfig } from "./global";
import {
  encodeProjectPath,
  homeDir,
  projectConfigPath,
  projectStateDir,
  storeSkillDir,
} from "./paths";
import {
  defaultProjectConfig,
  isInitialized,
  mergeLocks,
  readEffectiveLockfile,
  readLockfile,
  readProjectConfig,
  readProjectLock,
  writeLockfile,
  writeProjectConfig,
  writeProjectLock,
} from "./project";
import type { LockEntry } from "../types";

/** Build a minimal lock entry for tests. */
function entry(name: string, version: string): LockEntry {
  return {
    name,
    source: { type: "local", path: `/src/${name}` },
    version,
    mode: "link",
    integrity: `sha-${version}`,
  };
}

const tmpDirs: string[] = [];

/** Create a throwaway directory tracked for cleanup. */
async function tmp(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "skillmesh-"));
  tmpDirs.push(dir);
  return dir;
}

afterAll(async () => {
  await Promise.all(tmpDirs.map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("paths", () => {
  test("homeDir honors the ENV override", () => {
    expect(homeDir({ [envVars.home]: "/custom/home" })).toBe(resolve("/custom/home"));
  });

  test("homeDir falls back to ~/.skillmesh", () => {
    expect(homeDir({})).toMatch(/[\\/]\.skillmesh$/);
  });

  test("storeSkillDir keys by name@version", () => {
    expect(storeSkillDir("foo", "1.2.3", "/home")).toMatch(/foo@1\.2\.3$/);
  });

  test("encodeProjectPath produces a flat, safe name", () => {
    const encoded = encodeProjectPath("/a/b/c");
    expect(encoded).not.toContain("/");
    expect(encoded).not.toContain("\\");
    expect(encoded).not.toContain(":");
  });

  test("project state lives under home, never in the project", () => {
    const home = "/home";
    const stateDir = projectStateDir("/some/project", home);
    expect(stateDir.startsWith(join(home, "projects"))).toBe(true);
    expect(projectConfigPath("/some/project", home).startsWith(stateDir)).toBe(true);
  });
});

describe("global config", () => {
  test("returns defaults when missing", async () => {
    const home = await tmp();
    const config = await readGlobalConfig(home);
    expect(config).toEqual({ version: 1, presets: {} });
  });

  test("normalizes local preset paths on read, keeping ~ and deduping collapsed sources", async () => {
    const home = await tmp();
    // A config written before paths were normalized at parse time: relative, ~-rooted, and two
    // differently-spelled absolute paths that point at the same directory.
    await writeGlobalConfig(
      {
        version: 1,
        presets: {
          team: {
            name: "team",
            sources: [
              { type: "local", path: "./rel/foo" },
              { type: "local", path: "~/skills/bar" },
              { type: "local", path: "/x/y" },
              { type: "local", path: "/x/z/../y" },
            ],
          },
        },
      },
      home,
    );

    const team = (await readGlobalConfig(home)).presets.team;
    expect(team?.sources).toEqual([
      { type: "local", path: resolve("./rel/foo") },
      { type: "local", path: "~/skills/bar" },
      { type: "local", path: resolve("/x/y") },
    ]);
  });

  test("resolveActiveProject prefers ENV over everything", async () => {
    const home = await tmp();
    expect(await resolveActiveProject({ home, env: { [envVars.project]: "/from/env" }, cwd: "/cwd" })).toBe(
      resolve("/from/env"),
    );
  });

  test("resolveActiveProject falls back to cwd when no enclosing project exists", async () => {
    const home = await tmp();
    expect(await resolveActiveProject({ home, env: {}, cwd: "/the/cwd" })).toBe(resolve("/the/cwd"));
  });

  test("resolveActiveProject: standing in an initialized project resolves to it", async () => {
    const home = await tmp();
    const project = await tmp();
    await writeProjectConfig(project, defaultProjectConfig(), home);

    expect(await resolveActiveProject({ home, env: {}, cwd: project })).toBe(resolve(project));
  });

  test("resolveActiveProject: resolves the enclosing project from a subdirectory", async () => {
    const home = await tmp();
    const project = await tmp();
    await writeProjectConfig(project, defaultProjectConfig(), home);

    const nested = join(project, "src", "deep");
    expect(await resolveActiveProject({ home, env: {}, cwd: nested })).toBe(resolve(project));
  });

  test("resolveActiveProject: ENV still wins even inside an initialized project", async () => {
    const home = await tmp();
    const project = await tmp();
    await writeProjectConfig(project, defaultProjectConfig(), home);

    expect(
      await resolveActiveProject({ home, env: { [envVars.project]: "/from/env" }, cwd: project }),
    ).toBe(resolve("/from/env"));
  });
});

describe("project config (stored in home)", () => {
  test("isInitialized reflects presence of config", async () => {
    const home = await tmp();
    const project = await tmp();
    expect(await isInitialized(project, home)).toBe(false);
    await writeProjectConfig(project, defaultProjectConfig(), home);
    expect(await isInitialized(project, home)).toBe(true);
  });

  test("round-trips the project config", async () => {
    const home = await tmp();
    const project = await tmp();
    const config = {
      ...defaultProjectConfig(),
      skillsDirs: [".claude/skills", ".codex/skills"],
      defaultMode: "copy" as const,
    };
    await writeProjectConfig(project, config, home);
    expect(await readProjectConfig(project, home)).toEqual(config);
  });

  test("migrates a legacy single skillsDir to skillsDirs", async () => {
    const home = await tmp();
    const project = await tmp();
    // A config written before the multi-dir change: a single `skillsDir` string, no `skillsDirs`.
    const legacy = { version: 1, skillsDir: ".skills", defaultMode: "link", projectLock: false, syncImports: true };
    await writeProjectConfig(project, legacy as never, home);

    const read = await readProjectConfig(project, home);
    expect(read?.skillsDirs).toEqual([".skills"]);
    expect(read).not.toHaveProperty("skillsDir");
  });

  test("writes state into home, not into the project directory", async () => {
    const home = await tmp();
    const project = await tmp();
    await writeProjectConfig(project, defaultProjectConfig(), home);
    expect(await pathExists(join(project, "skillmesh.json"))).toBe(false);
    expect(await pathExists(join(project, "config.json"))).toBe(false);
    expect(await pathExists(projectConfigPath(project, home))).toBe(true);
  });

  test("lockfile defaults to empty and round-trips", async () => {
    const home = await tmp();
    const project = await tmp();
    expect(await readLockfile(project, home)).toEqual({ version: 1, skills: [] });

    const lockfile = {
      version: 1,
      skills: [
        {
          name: "foo",
          source: { type: "local" as const, path: "/x" },
          version: "abc",
          mode: "link" as const,
          integrity: "sha",
        },
      ],
    };
    await writeLockfile(project, lockfile, home);
    expect(await readLockfile(project, home)).toEqual(lockfile);
  });
});

describe("two-lock model (home + project)", () => {
  test("mergeLocks: project wins on conflict, home adds local-only, sorted", () => {
    const home = { version: 1, skills: [entry("shared", "home"), entry("local-only", "h1")] };
    const project = { version: 1, skills: [entry("shared", "project"), entry("team", "p1")] };

    const merged = mergeLocks(project, home);
    const names = merged.skills.map((s) => s.name);
    expect(names).toEqual(["local-only", "shared", "team"]); // sorted
    expect(merged.skills.find((s) => s.name === "shared")?.version).toBe("project"); // project wins
  });

  test("mergeLocks: no project lock falls back to home", () => {
    const home = { version: 1, skills: [entry("a", "1")] };
    expect(mergeLocks(null, home)).toEqual(home);
  });

  test("project lock lives in the project root (the one intentional project file)", async () => {
    const project = await tmp();
    expect(await readProjectLock(project)).toBeNull();

    const lock = { version: 1, skills: [entry("team", "1")] };
    await writeProjectLock(project, lock);
    expect(await pathExists(join(project, "skillmesh.lock.json"))).toBe(true);
    expect(await readProjectLock(project)).toEqual(lock);
  });

  test("readEffectiveLockfile merges committed project lock over home lock", async () => {
    const home = await tmp();
    const project = await tmp();
    await writeLockfile(project, { version: 1, skills: [entry("shared", "home"), entry("mine", "1")] }, home);
    await writeProjectLock(project, { version: 1, skills: [entry("shared", "project")] });

    const effective = await readEffectiveLockfile(project, home);
    expect(effective.skills.map((s) => s.name)).toEqual(["mine", "shared"]);
    expect(effective.skills.find((s) => s.name === "shared")?.version).toBe("project");
  });
});
