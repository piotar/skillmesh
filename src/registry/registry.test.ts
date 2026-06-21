import { afterAll, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { installedSkillDir, storeSkillDir } from "../config/paths";
import {
  defaultProjectConfig,
  readLockfile,
  readProjectLock,
  writeProjectConfig,
} from "../config/project";
import { linkStatus, uninstallSkill } from "../link/link";
import { buildManifest } from "../manifest/manifest";
import { registerPlugin, resetPlugins } from "../plugin/host";
import { addSourceToPreset } from "../preset/preset";
import { parseSkillMd } from "../skill/frontmatter";
import { addToStore, hasStoreSkill } from "../store/store";
import type { ProjectConfig } from "../types";
import {
  addSkill,
  addStoredSkill,
  applyPreset,
  listSkills,
  projectStatus,
  removeSkill,
  syncProject,
  updateSkill,
  validateProject,
} from "./registry";

const tmpDirs: string[] = [];

/** Create a throwaway directory tracked for cleanup. */
async function tmp(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "skillmesh-reg-"));
  tmpDirs.push(dir);
  return dir;
}

/** Create a local skill source directory with a SKILL.md. */
async function makeSource(name: string, body = "body"): Promise<string> {
  const dir = await tmp();
  await Bun.write(join(dir, "SKILL.md"), `---\nname: ${name}\ndescription: a skill\n---\n${body}\n`);
  return dir;
}

/** Initialize a project (config stored in home) and return its path. */
async function initProject(home: string, overrides: Partial<ProjectConfig> = {}): Promise<string> {
  const project = await tmp();
  await writeProjectConfig(project, { ...defaultProjectConfig(), ...overrides }, home);
  return project;
}

/** Read an installed skill's SKILL.md frontmatter. */
async function readInstalledName(project: string, name: string): Promise<string> {
  const file = join(installedSkillDir(project, ".claude/skills", name), "SKILL.md");
  return parseSkillMd(await Bun.file(file).text()).frontmatter.name;
}

afterAll(async () => {
  await Promise.all(tmpDirs.map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("addSkill", () => {
  test("links a compliant skill and records it in the home lock", async () => {
    const home = await tmp();
    const project = await initProject(home);
    const source = await makeSource("foo");

    const result = await addSkill({ projectPath: project, source: { type: "local", path: source }, home });
    expect(result).toMatchObject({ name: "foo", mode: "link" });
    expect(result.renamedFrom).toBeUndefined();
    expect(await hasStoreSkill("foo", result.version, home)).toBe(true);

    const lock = await readLockfile(project, home);
    expect(lock.skills.map((s) => s.name)).toEqual(["foo"]);

    const listed = await listSkills({ projectPath: project, home });
    expect(listed).toMatchObject([{ name: "foo", kind: "managed", status: "link", mode: "link" }]);
  });

  test("honors copy mode", async () => {
    const home = await tmp();
    const project = await initProject(home);
    const result = await addSkill({
      projectPath: project,
      source: { type: "local", path: await makeSource("foo") },
      mode: "copy",
      home,
    });
    expect(result.mode).toBe("copy");
    const listed = await listSkills({ projectPath: project, home });
    expect(listed[0]?.status).toBe("dir");
  });

  test("normalizes a non-compliant name (copy + rewrite)", async () => {
    const home = await tmp();
    const project = await initProject(home);
    const result = await addSkill({
      projectPath: project,
      source: { type: "local", path: await makeSource("Foo Bar!") },
      home,
    });
    expect(result.name).toBe("foo-bar");
    expect(result.mode).toBe("copy"); // rewrite forces copy
    expect(await readInstalledName(project, "foo-bar")).toBe("foo-bar");
  });

  test("resolves a name conflict by renaming (prompted) and rewriting SKILL.md", async () => {
    const home = await tmp();
    const project = await initProject(home);
    await addSkill({ projectPath: project, source: { type: "local", path: await makeSource("foo") }, home });

    const calls: string[] = [];
    const result = await addSkill({
      projectPath: project,
      source: { type: "local", path: await makeSource("foo", "different") },
      home,
      resolveName: (proposed) => {
        calls.push(proposed);
        return proposed;
      },
    });

    expect(calls).toEqual(["foo-2"]);
    expect(result).toMatchObject({ name: "foo-2", renamedFrom: "foo", mode: "copy" });
    expect(await readInstalledName(project, "foo-2")).toBe("foo-2"); // name matches dir
  });

  test("refuses to re-add the same source", async () => {
    const home = await tmp();
    const project = await initProject(home);
    const source = { type: "local" as const, path: await makeSource("foo") };
    await addSkill({ projectPath: project, source, home });
    await expect(addSkill({ projectPath: project, source, home })).rejects.toThrow(/already added/);
  });

  test("fails on an uninitialized project", async () => {
    const home = await tmp();
    const project = await tmp();
    await expect(
      addSkill({ projectPath: project, source: { type: "local", path: await makeSource("foo") }, home }),
    ).rejects.toThrow(/not initialized/);
  });
});

describe("addStoredSkill", () => {
  test("installs from the cache and records the origin source", async () => {
    const home = await tmp();
    const project = await initProject(home);
    const content = await makeSource("cached");
    const source = { type: "local" as const, path: content };
    const dest = await addToStore(content, buildManifest({ name: "cached", source, version: "v1" }), home);

    const result = await addStoredSkill({
      projectPath: project,
      entry: { name: "cached", version: "v1", path: dest },
      home,
    });
    expect(result).toMatchObject({ name: "cached", version: "v1", mode: "link" });

    const lock = await readLockfile(project, home);
    expect(lock.skills[0]).toMatchObject({ name: "cached", source, version: "v1" });
  });

  test("renames when the name is already taken, recording the new origin", async () => {
    const home = await tmp();
    const project = await initProject(home);
    await addSkill({ projectPath: project, source: { type: "local", path: await makeSource("cached") }, home });

    // A different-origin cached skill that also declares the name 'cached'.
    const other = await makeSource("cached", "other");
    const source = { type: "local" as const, path: other };
    const dest = await addToStore(other, buildManifest({ name: "cached", source, version: "vX" }), home);

    const result = await addStoredSkill({
      projectPath: project,
      entry: { name: "cached", version: "vX", path: dest },
      home,
      resolveName: (proposed) => proposed,
    });
    expect(result).toMatchObject({ name: "cached-2", renamedFrom: "cached", mode: "copy" });
    expect(await readInstalledName(project, "cached-2")).toBe("cached-2");
  });

  test("refuses a source already present in the project", async () => {
    const home = await tmp();
    const project = await initProject(home);
    const added = await addSkill({
      projectPath: project,
      source: { type: "local", path: await makeSource("cached") },
      home,
    });
    const dest = storeSkillDir("cached", added.version, home);

    await expect(
      addStoredSkill({
        projectPath: project,
        entry: { name: "cached", version: added.version, path: dest },
        home,
      }),
    ).rejects.toThrow(/already added/);
  });
});

describe("removeSkill", () => {
  test("uninstalls and drops the lock entry", async () => {
    const home = await tmp();
    const project = await initProject(home);
    await addSkill({ projectPath: project, source: { type: "local", path: await makeSource("foo") }, home });

    await removeSkill({ projectPath: project, name: "foo", home });
    expect((await readLockfile(project, home)).skills).toEqual([]);
    expect(await listSkills({ projectPath: project, home })).toEqual([]);
  });
});

describe("updateSkill", () => {
  test("re-fetches and reports a content change", async () => {
    const home = await tmp();
    const project = await initProject(home);
    const source = await makeSource("foo", "v1");
    const added = await addSkill({ projectPath: project, source: { type: "local", path: source }, home });

    await Bun.write(join(source, "SKILL.md"), `---\nname: foo\ndescription: a skill\n---\nv2\n`);
    const updated = await updateSkill({ projectPath: project, name: "foo", home });

    expect(updated.changed).toBe(true);
    expect(updated.to).not.toBe(added.version);
  });
});

describe("syncProject", () => {
  test("reinstalls a skill missing from the project", async () => {
    const home = await tmp();
    const project = await initProject(home);
    await addSkill({ projectPath: project, source: { type: "local", path: await makeSource("foo") }, home });

    await uninstallSkill(installedSkillDir(project, ".claude/skills", "foo"));
    const results = await syncProject({ projectPath: project, home });

    expect(results).toEqual([{ name: "foo", action: "installed" }]);
    expect((await listSkills({ projectPath: project, home }))[0]?.status).not.toBe("missing");
  });

  test("re-checks foreign manifests and imports new sources when syncImports is on", async () => {
    const home = await tmp();
    const project = await initProject(home); // syncImports defaults to true
    const foreign = await makeSource("from-manifest");
    registerPlugin({
      meta: { name: "t", apiVersion: 1 },
      importers: [
        { name: "t-importer", detect: () => true, load: () => Promise.resolve([{ type: "local", path: foreign }]) },
      ],
    });
    try {
      const results = await syncProject({ projectPath: project, home });
      expect(results).toContainEqual({ name: "from-manifest", action: "imported" });
      expect((await readLockfile(project, home)).skills.map((s) => s.name)).toContain("from-manifest");
    } finally {
      resetPlugins();
    }
  });

  test("does not touch foreign manifests when syncImports is disabled", async () => {
    const home = await tmp();
    const project = await initProject(home, { syncImports: false });
    const foreign = await makeSource("from-manifest");
    registerPlugin({
      meta: { name: "t", apiVersion: 1 },
      importers: [
        { name: "t-importer", detect: () => true, load: () => Promise.resolve([{ type: "local", path: foreign }]) },
      ],
    });
    try {
      const results = await syncProject({ projectPath: project, home });
      expect(results).toEqual([]);
      expect((await readLockfile(project, home)).skills).toEqual([]);
    } finally {
      resetPlugins();
    }
  });
});

describe("listSkills + validateProject", () => {
  test("distinguishes managed from project-local skills", async () => {
    const home = await tmp();
    const project = await initProject(home);
    await addSkill({ projectPath: project, source: { type: "local", path: await makeSource("managed") }, home });

    // A hand-authored skill committed to the project (no sidecar).
    const localDir = installedSkillDir(project, ".claude/skills", "mine");
    await Bun.write(join(localDir, "SKILL.md"), "---\nname: mine\ndescription: d\n---\n");

    const listed = await listSkills({ projectPath: project, home });
    expect(listed.find((s) => s.name === "managed")?.kind).toBe("managed");
    expect(listed.find((s) => s.name === "mine")?.kind).toBe("local");
  });

  test("flags a skill whose name no longer matches its directory", async () => {
    const home = await tmp();
    const project = await initProject(home);
    await addSkill({
      projectPath: project,
      source: { type: "local", path: await makeSource("foo") },
      mode: "copy",
      home,
    });

    const file = join(installedSkillDir(project, ".claude/skills", "foo"), "SKILL.md");
    await Bun.write(file, "---\nname: bar\ndescription: d\n---\n");

    const issues = await validateProject({ projectPath: project, home });
    expect(issues.find((i) => i.name === "foo")?.errors.join(" ")).toMatch(/match the directory/);
  });
});

describe("projectStatus", () => {
  test("classifies ok, missing, untracked and local skills", async () => {
    const home = await tmp();
    const project = await initProject(home);

    // ok: installed and tracked
    await addSkill({ projectPath: project, source: { type: "local", path: await makeSource("ok-one") }, home });

    // missing: tracked but removed from disk
    await addSkill({ projectPath: project, source: { type: "local", path: await makeSource("gone") }, home });
    await uninstallSkill(installedSkillDir(project, ".claude/skills", "gone"));

    // local: hand-authored, no sidecar, not in lock
    await Bun.write(
      join(installedSkillDir(project, ".claude/skills", "mine"), "SKILL.md"),
      "---\nname: mine\ndescription: d\n---\n",
    );

    const report = await projectStatus({ projectPath: project, home });
    expect(report.ok).toEqual(["ok-one"]);
    expect(report.missing).toEqual(["gone"]);
    expect(report.local).toEqual(["mine"]);
    expect(report.healthy).toBe(false);
  });

  test("reports healthy when everything is in place", async () => {
    const home = await tmp();
    const project = await initProject(home);
    await addSkill({ projectPath: project, source: { type: "local", path: await makeSource("foo") }, home });

    const report = await projectStatus({ projectPath: project, home });
    expect(report).toMatchObject({ ok: ["foo"], missing: [], broken: [], untracked: [], healthy: true });
  });
});

describe("applyPreset", () => {
  test("adds every source in a preset and skips duplicates on re-apply", async () => {
    const home = await tmp();
    const project = await initProject(home);
    await addSourceToPreset("dev", { type: "local", path: await makeSource("alpha") }, home);
    await addSourceToPreset("dev", { type: "local", path: await makeSource("beta") }, home);

    const first = await applyPreset({ projectPath: project, preset: "dev", home });
    expect(first.applied.map((a) => a.name).sort()).toEqual(["alpha", "beta"]);
    expect(first.skipped).toEqual([]);

    // Re-applying is idempotent: same sources are already present.
    const second = await applyPreset({ projectPath: project, preset: "dev", home });
    expect(second.applied).toEqual([]);
    expect(second.skipped).toHaveLength(2);
  });

  test("throws for an unknown preset", async () => {
    const home = await tmp();
    const project = await initProject(home);
    await expect(applyPreset({ projectPath: project, preset: "nope", home })).rejects.toThrow(
      /does not exist/,
    );
  });
});

describe("multiple skills dirs (mirror)", () => {
  const dirs = [".claude/skills", ".codex/skills"];

  test("addSkill mirrors the skill into every configured dir", async () => {
    const home = await tmp();
    const project = await initProject(home, { skillsDirs: dirs });
    await addSkill({ projectPath: project, source: { type: "local", path: await makeSource("foo") }, home });

    for (const dir of dirs) {
      expect(await linkStatus(installedSkillDir(project, dir, "foo"))).toBe("link");
    }
    // Still one logical skill, listed once.
    expect((await listSkills({ projectPath: project, home })).map((s) => s.name)).toEqual(["foo"]);
  });

  test("removeSkill clears the skill from every dir", async () => {
    const home = await tmp();
    const project = await initProject(home, { skillsDirs: dirs });
    await addSkill({ projectPath: project, source: { type: "local", path: await makeSource("foo") }, home });

    await removeSkill({ projectPath: project, name: "foo", home });
    for (const dir of dirs) {
      expect(await linkStatus(installedSkillDir(project, dir, "foo"))).toBe("missing");
    }
  });

  test("a skill missing from one dir is flagged and re-mirrored by sync", async () => {
    const home = await tmp();
    const project = await initProject(home, { skillsDirs: dirs });
    await addSkill({ projectPath: project, source: { type: "local", path: await makeSource("foo") }, home });

    // Drop it from just one of the dirs: doctor should see a partial mirror...
    await uninstallSkill(installedSkillDir(project, ".codex/skills", "foo"));
    expect((await projectStatus({ projectPath: project, home })).missing).toEqual(["foo"]);

    // ...and sync should restore it everywhere.
    const results = await syncProject({ projectPath: project, home });
    expect(results).toEqual([{ name: "foo", action: "installed" }]);
    for (const dir of dirs) {
      expect(await linkStatus(installedSkillDir(project, dir, "foo"))).toBe("link");
    }
  });
});

describe("two-lock scope", () => {
  test("project-scoped adds reach the committed project lock; local ones do not", async () => {
    const home = await tmp();
    const project = await initProject(home, { projectLock: true });

    await addSkill({
      projectPath: project,
      source: { type: "local", path: await makeSource("shared") },
      scope: "project",
      home,
    });
    await addSkill({
      projectPath: project,
      source: { type: "local", path: await makeSource("personal") },
      scope: "local",
      home,
    });

    const projectLock = await readProjectLock(project);
    expect(projectLock?.skills.map((s) => s.name)).toEqual(["shared"]);

    const homeLock = await readLockfile(project, home);
    expect(homeLock.skills.map((s) => s.name).sort()).toEqual(["personal", "shared"]);
  });
});
