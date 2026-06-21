import { afterAll, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ensureDir } from "../util/fs";
import { installSkill, linkStatus, uninstallSkill } from "./link";

const tmpDirs: string[] = [];

/** Create a throwaway directory tracked for cleanup. */
async function tmp(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "skillmesh-link-"));
  tmpDirs.push(dir);
  return dir;
}

/** Create a "store" skill directory with a single file. */
async function makeTarget(content: string): Promise<string> {
  const dir = await tmp();
  await ensureDir(dir);
  await Bun.write(join(dir, "SKILL.md"), content);
  return dir;
}

afterAll(async () => {
  await Promise.all(tmpDirs.map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("link (link mode)", () => {
  test("installs a working link readable through the project path", async () => {
    const target = await makeTarget("linked-content");
    const dest = join(await tmp(), "skills", "foo");

    await installSkill(target, dest, "link");
    expect(await Bun.file(join(dest, "SKILL.md")).text()).toBe("linked-content");
    expect(await linkStatus(dest)).toBe("link");
  });

  test("uninstall removes the link but not the store target", async () => {
    const target = await makeTarget("keep-me");
    const dest = join(await tmp(), "skills", "foo");
    await installSkill(target, dest, "link");

    await uninstallSkill(dest);
    expect(await linkStatus(dest)).toBe("missing");
    expect(await Bun.file(join(target, "SKILL.md")).text()).toBe("keep-me");
  });

  test("a link whose target is gone reports broken", async () => {
    const target = await makeTarget("temporary");
    const dest = join(await tmp(), "skills", "foo");
    await installSkill(target, dest, "link");

    await rm(target, { recursive: true, force: true });
    expect(await linkStatus(dest)).toBe("broken");
  });
});

describe("link (copy mode)", () => {
  test("installs an independent copy", async () => {
    const target = await makeTarget("v1");
    const dest = join(await tmp(), "skills", "foo");

    await installSkill(target, dest, "copy");
    expect(await Bun.file(join(dest, "SKILL.md")).text()).toBe("v1");
    expect(await linkStatus(dest)).toBe("dir");

    // Mutating the source must not affect the copy.
    await Bun.write(join(target, "SKILL.md"), "v2");
    expect(await Bun.file(join(dest, "SKILL.md")).text()).toBe("v1");
  });
});

describe("link (guards)", () => {
  test("installing over an existing destination throws", async () => {
    const target = await makeTarget("x");
    const dest = join(await tmp(), "skills", "foo");
    await installSkill(target, dest, "link");
    await expect(installSkill(target, dest, "link")).rejects.toThrow(/already exists/);
  });

  test("linkStatus reports missing for an absent path", async () => {
    expect(await linkStatus(join(await tmp(), "nope"))).toBe("missing");
  });
});
