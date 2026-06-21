import { afterAll, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ensureDir } from "../util/fs";
import { fetchSource } from "./fetch";
import { fetchLocal } from "./local";
import { resolveSkillDir } from "./util";

const tmpDirs: string[] = [];

/** Create a throwaway directory tracked for cleanup. */
async function tmp(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "skillmesh-src-"));
  tmpDirs.push(dir);
  return dir;
}

/** Create a valid skill directory with a SKILL.md. */
async function makeSkill(name: string): Promise<string> {
  const dir = await tmp();
  await ensureDir(dir);
  await Bun.write(join(dir, "SKILL.md"), `---\nname: ${name}\ndescription: d\n---\n`);
  return dir;
}

afterAll(async () => {
  await Promise.all(tmpDirs.map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("resolveSkillDir", () => {
  test("returns the dir when a SKILL.md is present", async () => {
    const dir = await makeSkill("foo");
    expect(await resolveSkillDir(dir)).toBe(dir);
  });

  test("applies a subpath", async () => {
    const root = await tmp();
    await ensureDir(join(root, "skills", "foo"));
    await Bun.write(join(root, "skills", "foo", "SKILL.md"), "---\nname: foo\ndescription: d\n---\n");
    expect(await resolveSkillDir(root, "skills/foo")).toBe(join(root, "skills", "foo"));
  });

  test("throws when the directory is missing", async () => {
    await expect(resolveSkillDir(join(await tmp(), "nope"))).rejects.toThrow(/not found/);
  });

  test("throws when SKILL.md is missing", async () => {
    await expect(resolveSkillDir(await tmp())).rejects.toThrow(/SKILL\.md/);
  });
});

describe("fetchLocal", () => {
  test("resolves the dir and hashes content as the version", async () => {
    const dir = await makeSkill("foo");
    const result = await fetchLocal({ type: "local", path: dir });
    expect(result.dir).toBe(dir);
    expect(result.version).toMatch(/^[0-9a-f]{64}$/); // sha256
    await result.cleanup(); // no-op; must not throw or delete
    expect(await Bun.file(join(dir, "SKILL.md")).exists()).toBe(true);
  });

  test("dispatcher routes local sources to fetchLocal", async () => {
    const dir = await makeSkill("foo");
    const result = await fetchSource({ type: "local", path: dir });
    expect(result.dir).toBe(dir);
  });
});
