import { afterAll, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { files } from "../constants";
import { ensureDir } from "./fs";
import { hashDir } from "./hash";

const tmpDirs: string[] = [];

/** Create a throwaway directory tracked for cleanup. */
async function tmp(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "skillmesh-hash-"));
  tmpDirs.push(dir);
  return dir;
}

/** Write a skill directory with the given files (relative path -> content). */
async function makeSkill(contents: Record<string, string>): Promise<string> {
  const dir = await tmp();
  for (const [rel, body] of Object.entries(contents)) {
    const full = join(dir, rel);
    await ensureDir(join(full, ".."));
    await Bun.write(full, body);
  }
  return dir;
}

afterAll(async () => {
  await Promise.all(tmpDirs.map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("hashDir", () => {
  test("identical content yields identical hashes", async () => {
    const a = await makeSkill({ "SKILL.md": "x", "scripts/run.sh": "echo hi" });
    const b = await makeSkill({ "SKILL.md": "x", "scripts/run.sh": "echo hi" });
    expect(await hashDir(a)).toBe(await hashDir(b));
  });

  test("different content yields different hashes", async () => {
    const a = await makeSkill({ "SKILL.md": "one" });
    const b = await makeSkill({ "SKILL.md": "two" });
    expect(await hashDir(a)).not.toBe(await hashDir(b));
  });

  test("the sidecar is excluded from the hash", async () => {
    const dir = await makeSkill({ "SKILL.md": "x" });
    const before = await hashDir(dir);
    await Bun.write(join(dir, files.sidecar), JSON.stringify({ name: "x" }));
    expect(await hashDir(dir)).toBe(before);
  });
});
