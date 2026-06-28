import { describe, expect, test } from "bun:test";
import type {
  GithubSource,
  GitSource,
  LocalSource,
  NpmSource,
  PluginSource,
  TarballSource,
} from "../types";
import { sourceEquals } from "./equals";

describe("sourceEquals", () => {
  test("sources of different types are never equal", () => {
    const local: LocalSource = { type: "local", path: "./skills/foo" };
    const git: GitSource = { type: "git", url: "https://host/repo.git" };

    expect(sourceEquals(local, git)).toBe(false);
  });

  test("local sources are equal iff their path matches", () => {
    const a: LocalSource = { type: "local", path: "./skills/foo" };

    expect(sourceEquals(a, { type: "local", path: "./skills/foo" })).toBe(true);
    expect(sourceEquals(a, { type: "local", path: "./skills/bar" })).toBe(false);
  });

  test("git sources compare url, ref and subpath", () => {
    const a: GitSource = { type: "git", url: "https://host/repo.git", ref: "v1", subpath: "skills" };

    expect(sourceEquals(a, { ...a })).toBe(true);
    expect(sourceEquals(a, { ...a, ref: "v2" })).toBe(false);
    expect(sourceEquals(a, { ...a, subpath: "other" })).toBe(false);
    expect(sourceEquals(a, { type: "git", url: "https://host/other.git" })).toBe(false);
  });

  test("github sources compare repo, ref and subpath", () => {
    const a: GithubSource = { type: "github", repo: "owner/repo", ref: "main", subpath: "skills" };

    expect(sourceEquals(a, { ...a })).toBe(true);
    expect(sourceEquals(a, { ...a, repo: "owner/other" })).toBe(false);
    expect(sourceEquals(a, { ...a, ref: "dev" })).toBe(false);
  });

  test("npm sources compare package, version and subpath", () => {
    const a: NpmSource = { type: "npm", package: "pkg", version: "1.2.3", subpath: "skills" };

    expect(sourceEquals(a, { ...a })).toBe(true);
    expect(sourceEquals(a, { ...a, version: "1.2.4" })).toBe(false);
    expect(sourceEquals(a, { type: "npm", package: "other" })).toBe(false);
  });

  test("tarball sources compare url and subpath", () => {
    const a: TarballSource = { type: "tarball", url: "https://host/skill.tgz", subpath: "skills" };

    expect(sourceEquals(a, { ...a })).toBe(true);
    expect(sourceEquals(a, { ...a, subpath: "other" })).toBe(false);
    expect(sourceEquals(a, { type: "tarball", url: "https://host/other.tgz" })).toBe(false);
  });

  test("plugin sources without a registered adapter compare adapter id and payload", () => {
    const a: PluginSource = { type: "plugin", adapter: "myreg", payload: { id: "requests" } };

    expect(sourceEquals(a, { ...a, payload: { id: "requests" } })).toBe(true);
    expect(sourceEquals(a, { ...a, payload: { id: "flask" } })).toBe(false);
    expect(sourceEquals(a, { ...a, adapter: "other" })).toBe(false);
  });

  test("plugin payload equality is independent of key order", () => {
    const a: PluginSource = { type: "plugin", adapter: "myreg", payload: { id: "x", ref: "1" } };
    const b: PluginSource = { type: "plugin", adapter: "myreg", payload: { ref: "1", id: "x" } };

    expect(sourceEquals(a, b)).toBe(true);
  });
});
