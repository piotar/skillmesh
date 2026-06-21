import { afterAll, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { SourceSpec } from "../types";
import {
  addSourceToPreset,
  createPreset,
  getPreset,
  listPresets,
  removePreset,
  removeSourceFromPreset,
} from "./preset";

const tmpDirs: string[] = [];

/** Create a throwaway home dir tracked for cleanup. */
async function tmp(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "skillmesh-preset-"));
  tmpDirs.push(dir);
  return dir;
}

const git = (url: string): SourceSpec => ({ type: "git", url });

afterAll(async () => {
  await Promise.all(tmpDirs.map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("preset definitions", () => {
  test("create then list", async () => {
    const home = await tmp();
    await createPreset("dev", home);
    expect((await listPresets(home)).map((p) => p.name)).toEqual(["dev"]);
  });

  test("creating a duplicate preset throws", async () => {
    const home = await tmp();
    await createPreset("dev", home);
    await expect(createPreset("dev", home)).rejects.toThrow(/already exists/);
  });

  test("addSourceToPreset creates on demand and dedupes", async () => {
    const home = await tmp();
    await addSourceToPreset("dev", git("https://h/a.git"), home);
    await addSourceToPreset("dev", git("https://h/a.git"), home); // duplicate ignored
    await addSourceToPreset("dev", git("https://h/b.git"), home);

    const preset = await getPreset("dev", home);
    expect(preset?.sources).toHaveLength(2);
  });

  test("one source can belong to several presets", async () => {
    const home = await tmp();
    const shared = git("https://h/shared.git");
    await addSourceToPreset("dev", shared, home);
    await addSourceToPreset("ci", shared, home);

    expect((await getPreset("dev", home))?.sources).toContainEqual(shared);
    expect((await getPreset("ci", home))?.sources).toContainEqual(shared);
  });

  test("removeSourceFromPreset removes a single source", async () => {
    const home = await tmp();
    await addSourceToPreset("dev", git("https://h/a.git"), home);
    await addSourceToPreset("dev", git("https://h/b.git"), home);
    await removeSourceFromPreset("dev", git("https://h/a.git"), home);

    expect((await getPreset("dev", home))?.sources).toEqual([git("https://h/b.git")]);
  });

  test("removePreset deletes the whole preset", async () => {
    const home = await tmp();
    await createPreset("dev", home);
    await removePreset("dev", home);
    expect(await getPreset("dev", home)).toBeNull();
  });
});
