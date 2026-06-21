import { afterAll, afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { defaultProjectConfig, writeProjectConfig } from "../config/project";
import { importManifests } from "../registry/registry";
import { parseSource } from "../sources/resolve";
import { pathExists } from "../util/fs";
import { getSourceAdapter, resetPlugins } from "./host";
import { loadEnabledPlugins } from "./load";
import { disablePlugin, installPlugin, listPlugins, removePlugin } from "./manage";
import { readPluginsRegistry } from "./registry";

const tmpDirs: string[] = [];

async function tmp(prefix = "skillmesh-plugin-"): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), prefix));
  tmpDirs.push(dir);
  return dir;
}

/** The plugin entry module: a `demo:` source adapter plus a `foreign.json` manifest importer. */
const entryModule = (apiVersion: number) => `
import { readFile } from "node:fs/promises";
import { join } from "node:path";
export default {
  meta: { name: "demo-plugin", apiVersion: ${apiVersion} },
  sources: [{
    type: "demo",
    scheme: "demo",
    parse: (raw) => raw.startsWith("demo:") ? { id: raw.slice(5) } : null,
    fetch: async () => ({ dir: "", version: "", cleanup: async () => {} }),
    describe: (p) => String(p.id),
  }],
  importers: [{
    name: "foreign",
    detect: async (dir) => { try { await readFile(join(dir, "foreign.json")); return true; } catch { return false; } },
    load: async (dir) => {
      const data = JSON.parse(await readFile(join(dir, "foreign.json"), "utf8"));
      return data.skills.map((path) => ({ type: "local", path }));
    },
  }],
};
`;

/** Write a valid plugin package (package.json + entry) into a fresh temp dir; return its path. */
async function makePluginFixture(apiVersion = 1): Promise<string> {
  const dir = await tmp("skillmesh-plugin-src-");
  await Bun.write(
    join(dir, "package.json"),
    JSON.stringify({ name: "demo-plugin", version: "0.0.0", type: "module", skillmesh: { plugin: "./index.mjs", apiVersion } }),
  );
  await Bun.write(join(dir, "index.mjs"), entryModule(apiVersion));
  return dir;
}

afterEach(() => resetPlugins());
afterAll(async () => {
  await Promise.all(tmpDirs.map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("installPlugin", () => {
  test("installs from a local source, records it enabled, and reports what it provides", async () => {
    const home = await tmp();
    const { installed, plugin } = await installPlugin({ type: "local", path: await makePluginFixture() }, home);

    expect(installed.name).toBe("demo-plugin");
    expect(installed.enabled).toBe(true);
    expect(plugin.sources).toHaveLength(1);
    expect(plugin.importers).toHaveLength(1);
    expect(await pathExists(installed.entry)).toBe(true);

    const registry = await readPluginsRegistry(home);
    expect(registry.plugins.map((p) => p.name)).toEqual(["demo-plugin"]);
  });

  test("rejects a source without a plugin manifest", async () => {
    const home = await tmp();
    const notAPlugin = await tmp("skillmesh-noplugin-");
    await Bun.write(join(notAPlugin, "README.md"), "no manifest here");
    await expect(installPlugin({ type: "local", path: notAPlugin }, home)).rejects.toThrow(
      /No plugin manifest/,
    );
  });

  test("skips a plugin built for an incompatible API version", async () => {
    const home = await tmp();
    await expect(
      installPlugin({ type: "local", path: await makePluginFixture(999) }, home),
    ).rejects.toThrow(/API v999/);
  });
});

describe("load + enable/disable/remove lifecycle", () => {
  test("loadEnabledPlugins registers an enabled plugin's adapter", async () => {
    const home = await tmp();
    await installPlugin({ type: "local", path: await makePluginFixture() }, home);

    await loadEnabledPlugins(home);
    expect(getSourceAdapter("demo")).toBeDefined();
    expect(parseSource("demo:thing")).toEqual({ type: "plugin", adapter: "demo", payload: { id: "thing" } });
  });

  test("a disabled plugin is not loaded", async () => {
    const home = await tmp();
    await installPlugin({ type: "local", path: await makePluginFixture() }, home);
    await disablePlugin("demo-plugin", home);

    await loadEnabledPlugins(home);
    expect(getSourceAdapter("demo")).toBeUndefined();
  });

  test("remove deletes the install dir and the registry entry", async () => {
    const home = await tmp();
    const { installed } = await installPlugin({ type: "local", path: await makePluginFixture() }, home);

    await removePlugin("demo-plugin", home);
    expect(await pathExists(installed.dir)).toBe(false);
    expect(await listPlugins(home)).toEqual([]);
  });

  test("enable/disable/remove on an unknown plugin throws", async () => {
    const home = await tmp();
    await expect(disablePlugin("nope", home)).rejects.toThrow(/not installed/);
    await expect(removePlugin("nope", home)).rejects.toThrow(/not installed/);
  });
});

describe("importManifests", () => {
  test("a manifest importer expands a foreign manifest into added skills", async () => {
    const home = await tmp();
    const project = await tmp("skillmesh-proj-");
    await writeProjectConfig(project, defaultProjectConfig(), home);

    // A real skill the foreign manifest points at.
    const skillDir = await tmp("skillmesh-skill-");
    await Bun.write(join(skillDir, "SKILL.md"), "---\nname: imported\ndescription: d\n---\nbody\n");
    await Bun.write(join(project, "foreign.json"), JSON.stringify({ skills: [skillDir] }));

    await installPlugin({ type: "local", path: await makePluginFixture() }, home);
    await loadEnabledPlugins(home);

    const result = await importManifests({ projectPath: project, home });
    expect(result.detected.map((d) => d.importer)).toEqual(["foreign"]);
    expect(result.applied.map((a) => a.name)).toEqual(["imported"]);
  });
});
