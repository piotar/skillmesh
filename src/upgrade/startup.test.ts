import { afterAll, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { envVars, pkg } from "../constants";
import { writeJson } from "../util/fs";
import { isAutoUpgradeEnabled, startupSelfManage } from "./startup";

const tmpDirs: string[] = [];

/** A throwaway SKILLMESH_HOME seeded with an update-check cache, so startup never hits the network. */
async function homeWithCache(latest: string): Promise<string> {
  const home = await mkdtemp(join(tmpdir(), "skillmesh-startup-"));
  tmpDirs.push(home);
  await writeJson(join(home, "update-check.json"), { checkedAt: Date.now(), latest });
  return home;
}

afterAll(async () => {
  await Promise.all(tmpDirs.map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("isAutoUpgradeEnabled", () => {
  test("is on by default", () => {
    expect(isAutoUpgradeEnabled({})).toBe(true);
  });

  test("is off when SKILLMESH_NO_AUTO_UPGRADE is truthy", () => {
    expect(isAutoUpgradeEnabled({ [envVars.noAutoUpgrade]: "1" })).toBe(false);
    expect(isAutoUpgradeEnabled({ [envVars.noAutoUpgrade]: "0" })).toBe(true);
  });
});

describe("startupSelfManage", () => {
  test("returns no notice when already up to date (fresh cache)", async () => {
    const home = await homeWithCache(pkg.version);
    const out = await startupSelfManage({ [envVars.home]: home }, ["node", "cli"]);
    expect(out).toEqual({});
  });

  test("does nothing inside the re-exec'd child (guard set)", async () => {
    const home = await homeWithCache("999.0.0");
    const env = { [envVars.home]: home, [envVars.upgradeGuard]: "1" };
    expect(await startupSelfManage(env, ["node", "cli"])).toEqual({});
  });

  test("notifies (no auto-upgrade) when a cached newer version exists but the check isn't fresh", async () => {
    // A within-window cache is never `fresh`, so auto-upgrade is skipped and we get a notice instead.
    const home = await homeWithCache("999.0.0");
    const out = await startupSelfManage({ [envVars.home]: home }, ["node", "cli"]);
    expect(out).toEqual({ notice: "999.0.0" });
  });

  test("suppresses the notice when SKILLMESH_NO_UPDATE_CHECK is set", async () => {
    const home = await homeWithCache("999.0.0");
    const env = { [envVars.home]: home, [envVars.skipUpdateCheck]: "1" };
    expect(await startupSelfManage(env, ["node", "cli"])).toEqual({});
  });
});
