import { afterAll, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { addToStore } from "../store/store";
import type { SkillManifest } from "../types";
import { ensureDir } from "../util/fs";
import {
  listAvailableSkills,
  listInstalledSkills,
  listPresetsInfo,
  readSkill,
} from "./discovery";

const tmpDirs: string[] = [];

/** Create a throwaway directory tracked for cleanup. */
async function tmp(prefix: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), prefix));
  tmpDirs.push(dir);
  return dir;
}

/** Create a content directory with a SKILL.md to feed into the store. */
async function makeContent(name: string, description = "d"): Promise<string> {
  const dir = await tmp("skillmesh-content-");
  await ensureDir(dir);
  await Bun.write(join(dir, "SKILL.md"), `---\nname: ${name}\ndescription: ${description}\n---\nBody of ${name}.\n`);
  return dir;
}

/** Build a manifest for a content directory. */
function manifest(name: string, version: string): SkillManifest {
  return {
    name,
    source: { type: "local", path: `/src/${name}` },
    version,
    installedAt: "2026-01-01T00:00:00.000Z",
  };
}

/** Seed a home with two cached skills (one with two versions). */
async function seedStore(): Promise<string> {
  const home = await tmp("skillmesh-home-");
  await addToStore(await makeContent("alpha", "first skill"), manifest("alpha", "v1"), home);
  await addToStore(await makeContent("alpha", "first skill"), manifest("alpha", "v2"), home);
  await addToStore(await makeContent("beta", "second skill"), manifest("beta", "v1"), home);
  return home;
}

afterAll(async () => {
  await Promise.all(tmpDirs.map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("mcp discovery", () => {
  test("list_available_skills lists one entry per name (latest version) with origin", async () => {
    const home = await seedStore();
    const skills = await listAvailableSkills(undefined, home);
    expect(skills).toEqual([
      { name: "alpha", version: "v2", description: "first skill", source: "local:/src/alpha" },
      { name: "beta", version: "v1", description: "second skill", source: "local:/src/beta" },
    ]);
  });

  test("list_available_skills filters by query against name and description", async () => {
    const home = await seedStore();
    expect((await listAvailableSkills("second", home)).map((s) => s.name)).toEqual(["beta"]);
    expect((await listAvailableSkills("alph", home)).map((s) => s.name)).toEqual(["alpha"]);
    expect(await listAvailableSkills("nope", home)).toEqual([]);
  });

  test("read_skill returns the latest cached SKILL.md by default", async () => {
    const home = await seedStore();
    const skill = await readSkill({ name: "alpha" }, home);
    expect(skill).toMatchObject({ name: "alpha", version: "v2", scope: "store", description: "first skill" });
    expect(skill?.content).toContain("Body of alpha.");
  });

  test("read_skill honors an explicit version", async () => {
    const home = await seedStore();
    const skill = await readSkill({ name: "alpha", version: "v1" }, home);
    expect(skill?.version).toBe("v1");
  });

  test("read_skill returns null for an unknown skill", async () => {
    const home = await seedStore();
    expect(await readSkill({ name: "ghost" }, home)).toBeNull();
  });

  test("list_presets is empty on a fresh home", async () => {
    const home = await tmp("skillmesh-home-");
    expect(await listPresetsInfo(home)).toEqual([]);
  });

  test("list_installed_skills returns no skills for an uninitialized project", async () => {
    const home = await tmp("skillmesh-home-");
    const project = await tmp("skillmesh-project-");
    process.env.SKILLMESH_PROJECT = project;
    try {
      // An uninitialized project has no config; listSkills throws — discovery surfaces that as an error.
      await expect(listInstalledSkills(home)).rejects.toThrow();
    } finally {
      delete process.env.SKILLMESH_PROJECT;
    }
  });
});
