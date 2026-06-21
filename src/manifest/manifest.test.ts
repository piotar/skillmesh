import { afterAll, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { SkillManifest } from "../types";
import {
  buildManifest,
  isManaged,
  readManifest,
  removeManifest,
  writeManifest,
} from "./manifest";

const tmpDirs: string[] = [];

/** Create a throwaway skill directory tracked for cleanup. */
async function tmp(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "skillmesh-mf-"));
  tmpDirs.push(dir);
  return dir;
}

afterAll(async () => {
  await Promise.all(tmpDirs.map((dir) => rm(dir, { recursive: true, force: true })));
});

const sample: SkillManifest = {
  name: "unit-tests",
  source: { type: "git", url: "https://example.com/repo.git", ref: "v1" },
  version: "abc123",
  installedAt: "2026-01-01T00:00:00.000Z",
};

describe("manifest", () => {
  test("a fresh skill dir is not managed", async () => {
    const dir = await tmp();
    expect(await isManaged(dir)).toBe(false);
    expect(await readManifest(dir)).toBeNull();
  });

  test("writing a manifest marks the skill as managed and round-trips", async () => {
    const dir = await tmp();
    await writeManifest(dir, sample);
    expect(await isManaged(dir)).toBe(true);
    expect(await readManifest(dir)).toEqual(sample);
  });

  test("removeManifest reverts a skill to project-local", async () => {
    const dir = await tmp();
    await writeManifest(dir, sample);
    await removeManifest(dir);
    expect(await isManaged(dir)).toBe(false);
  });

  test("removeManifest is a no-op when absent", async () => {
    const dir = await tmp();
    await removeManifest(dir);
    expect(await isManaged(dir)).toBe(false);
  });

  test("buildManifest stamps installedAt", () => {
    const built = buildManifest({ name: "x", source: { type: "local", path: "/p" }, version: "v" });
    expect(built.name).toBe("x");
    expect(Date.parse(built.installedAt)).not.toBeNaN();
  });
});
