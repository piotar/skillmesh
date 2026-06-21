import { afterAll, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { addToStore } from "../store/store";
import type { SkillManifest, SourceSpec } from "../types";
import { ensureDir } from "../util/fs";
import { collectStats } from "./stats";

const tmpDirs: string[] = [];

/** Create a throwaway directory tracked for cleanup. */
async function tmp(prefix: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), prefix));
  tmpDirs.push(dir);
  return dir;
}

/** Seed the store of `home` with a skill version from a given source. */
async function seed(home: string, name: string, version: string, source: SourceSpec): Promise<void> {
  const content = await tmp("skillmesh-content-");
  await ensureDir(content);
  await Bun.write(join(content, "SKILL.md"), `---\nname: ${name}\ndescription: d\n---\n`);
  const manifest: SkillManifest = { name, source, version, installedAt: "2026-01-01T00:00:00.000Z" };
  await addToStore(content, manifest, home);
}

afterAll(async () => {
  await Promise.all(tmpDirs.map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("collectStats", () => {
  test("empty home reports zeroed counts and an uninitialized active project", async () => {
    const home = await tmp("skillmesh-home-");

    const stats = await collectStats({ home });
    expect(stats.home).toBe(home);
    expect(stats.store.versions).toBe(0);
    expect(stats.store.names).toBe(0);
    expect(stats.projectsTracked).toBe(0);
    expect(stats.plugins).toEqual({ total: 0, enabled: 0 });
    expect(stats.active.initialized).toBe(false);
  });

  test("counts store versions, distinct names and a per-source breakdown", async () => {
    const home = await tmp("skillmesh-home-");
    await seed(home, "foo", "v1", { type: "github", repo: "o/r" });
    await seed(home, "foo", "v2", { type: "github", repo: "o/r" });
    await seed(home, "bar", "v1", { type: "local", path: "/x" });

    const stats = await collectStats({ home });
    expect(stats.store.versions).toBe(3);
    expect(stats.store.names).toBe(2);
    expect(stats.store.bySource).toEqual({ github: 2, local: 1 });
    expect(stats.store.sizeBytes).toBeGreaterThan(0);
  });
});
