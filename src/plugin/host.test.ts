import { afterEach, describe, expect, test } from "bun:test";
import { parseSource } from "../sources/resolve";
import { sourceEquals } from "../sources/equals";
import {
  describePluginSource,
  fetchViaPlugin,
  getSourceAdapter,
  listImporters,
  parseViaPlugins,
  pluginSourceEquals,
  registerPlugin,
  resetPlugins,
} from "./host";
import type { Plugin } from "./types";

/** A demo plugin claiming the `demo:` scheme, plus one importer. */
function demoPlugin(): Plugin {
  return {
    meta: { name: "demo", apiVersion: 1 },
    sources: [
      {
        type: "demo",
        scheme: "demo",
        parse: (raw) => (raw.startsWith("demo:") ? { id: raw.slice("demo:".length) } : null),
        fetch: () => Promise.resolve({ dir: "/tmp/x", version: "1", cleanup: async () => {} }),
        describe: (payload) => String(payload.id),
      },
    ],
    importers: [{ name: "demo-importer", detect: () => true, load: () => Promise.resolve([]) }],
  };
}

afterEach(() => resetPlugins());

describe("plugin host", () => {
  test("registers adapters and importers", () => {
    registerPlugin(demoPlugin());
    expect(getSourceAdapter("demo")).toBeDefined();
    expect(listImporters().map((i) => i.name)).toEqual(["demo-importer"]);
  });

  test("parseViaPlugins claims a registered scheme and ignores others", () => {
    registerPlugin(demoPlugin());
    expect(parseViaPlugins("demo:thing")).toEqual({
      type: "plugin",
      adapter: "demo",
      payload: { id: "thing" },
    });
    expect(parseViaPlugins("other:thing")).toBeNull();
  });

  test("parseSource routes a plugin scheme through the adapter", () => {
    registerPlugin(demoPlugin());
    expect(parseSource("demo:abc")).toEqual({
      type: "plugin",
      adapter: "demo",
      payload: { id: "abc" },
    });
  });

  test("built-in heuristics still win when no scheme matches", () => {
    registerPlugin(demoPlugin());
    expect(parseSource("owner/repo")).toEqual({ type: "github", repo: "owner/repo" });
    expect(parseSource("./local")).toEqual({ type: "local", path: "./local" });
  });

  test("pluginSourceEquals compares adapter + payload structurally", () => {
    registerPlugin(demoPlugin());
    const a = { type: "plugin" as const, adapter: "demo", payload: { id: "x" } };
    const b = { type: "plugin" as const, adapter: "demo", payload: { id: "x" } };
    const c = { type: "plugin" as const, adapter: "demo", payload: { id: "y" } };
    expect(pluginSourceEquals(a, b)).toBe(true);
    expect(pluginSourceEquals(a, c)).toBe(false);
    expect(sourceEquals(a, b)).toBe(true); // wired through the generic comparator
  });

  test("describePluginSource uses the adapter's describe", () => {
    registerPlugin(demoPlugin());
    expect(describePluginSource({ type: "plugin", adapter: "demo", payload: { id: "x" } })).toBe(
      "demo:x",
    );
  });

  test("fetchViaPlugin throws for an unknown adapter", async () => {
    await expect(
      fetchViaPlugin({ type: "plugin", adapter: "missing", payload: {} }),
    ).rejects.toThrow(/No plugin provides source adapter/);
  });

  test("an empty host leaves parseSource behavior unchanged", () => {
    expect(parseSource("demo:abc")).toEqual({ type: "npm", package: "demo:abc" });
  });
});
