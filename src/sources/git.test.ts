import { afterAll, afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { writeAuthConfig } from "../config/auth";
import { envVars } from "../constants";
import { ensureDir } from "../util/fs";
import { authConfigArgs, fetchGit } from "./git";
import { exec } from "./util";

const tmpDirs: string[] = [];
const hasGit = await exec(["git", "--version"]).then(() => true).catch(() => false);

/** Create a throwaway directory tracked for cleanup. */
async function tmp(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "skillmesh-git-test-"));
  tmpDirs.push(dir);
  return dir;
}

/** Initialize a local git repo containing a skill at skills/foo and return its path. */
async function makeRepo(): Promise<string> {
  const repo = await tmp();
  await exec(["git", "init", "-q", "-b", "main", repo]);
  await exec(["git", "-C", repo, "config", "user.email", "t@example.com"]);
  await exec(["git", "-C", repo, "config", "user.name", "Test"]);
  await exec(["git", "-C", repo, "config", "commit.gpgsign", "false"]);
  await ensureDir(join(repo, "skills", "foo"));
  await Bun.write(join(repo, "skills", "foo", "SKILL.md"), "---\nname: foo\ndescription: d\n---\n");
  await exec(["git", "-C", repo, "add", "-A"]);
  await exec(["git", "-C", repo, "commit", "-q", "-m", "init"]);
  return repo;
}

afterAll(async () => {
  await Promise.all(tmpDirs.map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("authConfigArgs (per-host credential injection)", () => {
  const prevHome = process.env[envVars.home];
  afterEach(() => {
    if (prevHome === undefined) delete process.env[envVars.home];
    else process.env[envVars.home] = prevHome;
  });

  test("injects a host-scoped extraHeader for a configured HTTPS host", async () => {
    const home = await tmp();
    process.env[envVars.home] = home;
    await writeAuthConfig({ version: 1, hosts: { "gitlab.firma.pl": { token: "t", scheme: "bearer" } } }, home);

    expect(await authConfigArgs("https://gitlab.firma.pl/g/r.git")).toEqual([
      "-c",
      "http.https://gitlab.firma.pl/.extraHeader=Authorization: Bearer t",
    ]);
  });

  test("no args when the host has no configured credential", async () => {
    const home = await tmp();
    process.env[envVars.home] = home;
    expect(await authConfigArgs("https://github.com/g/r.git")).toEqual([]);
  });

  test("no args for a non-HTTPS (SSH) URL even when the host is configured", async () => {
    const home = await tmp();
    process.env[envVars.home] = home;
    await writeAuthConfig({ version: 1, hosts: { "gitlab.firma.pl": { token: "t" } } }, home);
    expect(await authConfigArgs("git@gitlab.firma.pl:g/r.git")).toEqual([]);
  });
});

// Offline integration: clones from a local repo path (no network required).
const suite = hasGit ? describe : describe.skip;

suite("fetchGit (offline, local repo)", () => {
  test("clones and resolves a skill via subpath, version = commit", async () => {
    const repo = await makeRepo();
    const result = await fetchGit({ type: "git", url: repo, subpath: "skills/foo" });
    expect(await Bun.file(join(result.dir, "SKILL.md")).exists()).toBe(true);
    expect(result.version).toMatch(/^[0-9a-f]{40}$/);
    await result.cleanup();
  });

  test("checks out a tag ref", async () => {
    const repo = await makeRepo();
    await exec(["git", "-C", repo, "tag", "v1"]);
    const result = await fetchGit({ type: "git", url: repo, ref: "v1", subpath: "skills/foo" });
    expect(await Bun.file(join(result.dir, "SKILL.md")).exists()).toBe(true);
    await result.cleanup();
  });

  test("fails clearly when the subpath has no SKILL.md", async () => {
    const repo = await makeRepo();
    await expect(fetchGit({ type: "git", url: repo, subpath: "skills/missing" })).rejects.toThrow(
      /not found|SKILL\.md/,
    );
  });
});
