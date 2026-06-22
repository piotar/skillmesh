import { afterAll, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { storeSkillMetaPath } from "../config/paths";
import type { SkillManifest } from "../types";
import { ensureDir, pathExists } from "../util/fs";
import {
  addToStore,
  getStoreSkill,
  hasStoreSkill,
  latestPerName,
  listStore,
  listStoreEntries,
  readStoreMeta,
  removeFromStore,
} from "./store";

const tmpDirs: string[] = [];

/** Create a throwaway directory tracked for cleanup. */
async function tmp(prefix: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), prefix));
  tmpDirs.push(dir);
  return dir;
}

/** Create a content directory with a SKILL.md to feed into the store. */
async function makeContent(name: string): Promise<string> {
  const dir = await tmp("skillmesh-content-");
  await ensureDir(dir);
  await Bun.write(join(dir, "SKILL.md"), `---\nname: ${name}\ndescription: d\n---\n`);
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

afterAll(async () => {
  await Promise.all(tmpDirs.map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("store", () => {
  test("addToStore copies pristine content and records provenance in a sibling file", async () => {
    const home = await tmp("skillmesh-home-");
    const content = await makeContent("foo");
    const mf = manifest("foo", "v1");

    const dest = await addToStore(content, mf, home);
    expect(await Bun.file(join(dest, "SKILL.md")).exists()).toBe(true);
    // The content directory stays byte-for-byte the fetched artifact: no metadata inside it.
    expect(await pathExists(join(dest, ".skillmesh.json"))).toBe(false);
    expect(await pathExists(join(dest, "skillmesh.json"))).toBe(false);
    // Provenance lives in a sibling file next to the entry directory.
    expect(await readStoreMeta("foo", "v1", home)).toEqual(mf);
    expect(await hasStoreSkill("foo", "v1", home)).toBe(true);
  });

  test("getStoreSkill returns the entry or null", async () => {
    const home = await tmp("skillmesh-home-");
    await addToStore(await makeContent("foo"), manifest("foo", "v1"), home);
    expect(await getStoreSkill("foo", "v1", home)).toMatchObject({ name: "foo", version: "v1" });
    expect(await getStoreSkill("foo", "v2", home)).toBeNull();
  });

  test("listStore returns sorted entries", async () => {
    const home = await tmp("skillmesh-home-");
    await addToStore(await makeContent("bar"), manifest("bar", "v1"), home);
    await addToStore(await makeContent("foo"), manifest("foo", "v2"), home);
    await addToStore(await makeContent("foo"), manifest("foo", "v1"), home);

    const listed = await listStore(home);
    expect(listed.map((e) => `${e.name}@${e.version}`)).toEqual(["bar@v1", "foo@v1", "foo@v2"]);
  });

  test("listStore is empty when the store does not exist", async () => {
    const home = await tmp("skillmesh-home-");
    expect(await listStore(home)).toEqual([]);
  });

  test("removeFromStore deletes a version", async () => {
    const home = await tmp("skillmesh-home-");
    await addToStore(await makeContent("foo"), manifest("foo", "v1"), home);
    await removeFromStore("foo", "v1", home);
    expect(await hasStoreSkill("foo", "v1", home)).toBe(false);
  });

  test("listStoreEntries enriches with origin source and description", async () => {
    const home = await tmp("skillmesh-home-");
    await addToStore(await makeContent("foo"), manifest("foo", "v1"), home);

    const [entry] = await listStoreEntries(home);
    expect(entry).toMatchObject({
      name: "foo",
      version: "v1",
      description: "d",
      source: { type: "local", path: "/src/foo" },
    });
  });

  test("listStoreEntries tolerates missing provenance metadata", async () => {
    const home = await tmp("skillmesh-home-");
    await addToStore(await makeContent("foo"), manifest("foo", "v1"), home);
    await rm(storeSkillMetaPath("foo", "v1", home)); // no metadata: source can't be resolved

    const [entry] = await listStoreEntries(home);
    expect(entry?.source).toBeUndefined();
    expect(entry?.description).toBe("d"); // description still comes from SKILL.md
  });

  test("latestPerName keeps one entry per name (most recent version)", async () => {
    const home = await tmp("skillmesh-home-");
    await addToStore(await makeContent("foo"), manifest("foo", "v1"), home);
    await addToStore(await makeContent("foo"), manifest("foo", "v2"), home);
    await addToStore(await makeContent("bar"), manifest("bar", "v1"), home);

    const latest = latestPerName(await listStoreEntries(home));
    expect(latest.map((e) => `${e.name}@${e.version}`)).toEqual(["bar@v1", "foo@v2"]);
  });
});
