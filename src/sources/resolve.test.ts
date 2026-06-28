import { resolve } from "node:path";
import { describe, expect, test } from "bun:test";
import { parseSource } from "./resolve";

describe("parseSource — local", () => {
  test("relative paths resolve to absolute (file: scheme included)", () => {
    expect(parseSource("./skills/foo")).toEqual({ type: "local", path: resolve("./skills/foo") });
    expect(parseSource("file:./rel")).toEqual({ type: "local", path: resolve("./rel") });
  });

  test("absolute paths are kept, separators normalized by resolve", () => {
    expect(parseSource("/abs/path")).toEqual({ type: "local", path: resolve("/abs/path") });
    expect(parseSource("C:\\skills\\foo")).toEqual({ type: "local", path: resolve("C:\\skills\\foo") });
  });

  test("~-rooted paths are left untouched for portability", () => {
    expect(parseSource("~/skills/foo")).toEqual({ type: "local", path: "~/skills/foo" });
    expect(parseSource("~")).toEqual({ type: "local", path: "~" });
  });
});

describe("parseSource — git", () => {
  test("git URLs, schemes and refs", () => {
    expect(parseSource("git+https://h/r.git")).toEqual({ type: "git", url: "https://h/r.git" });
    expect(parseSource("https://h/r.git")).toEqual({ type: "git", url: "https://h/r.git" });
    expect(parseSource("https://h/r")).toEqual({ type: "git", url: "https://h/r" });
    expect(parseSource("git@github.com:o/r.git")).toEqual({
      type: "git",
      url: "git@github.com:o/r.git",
    });
    expect(parseSource("https://h/r.git#v2")).toEqual({
      type: "git",
      url: "https://h/r.git",
      ref: "v2",
    });
  });
});

describe("parseSource — github", () => {
  test("shorthand, scheme and ref", () => {
    expect(parseSource("github:owner/repo")).toEqual({ type: "github", repo: "owner/repo" });
    expect(parseSource("owner/repo")).toEqual({ type: "github", repo: "owner/repo" });
    expect(parseSource("owner/repo#dev")).toEqual({
      type: "github",
      repo: "owner/repo",
      ref: "dev",
    });
  });

  test("rejects malformed shorthand", () => {
    expect(() => parseSource("github:justone")).toThrow(/owner\/repo/);
  });

  test("web URLs with /tree/<ref>/<subpath>", () => {
    expect(parseSource("https://github.com/obra/superpowers/tree/main/skills/brainstorming")).toEqual(
      { type: "github", repo: "obra/superpowers", ref: "main", subpath: "skills/brainstorming" },
    );
    expect(parseSource("https://github.com/owner/repo/blob/v2/path/SKILL.md")).toEqual({
      type: "github",
      repo: "owner/repo",
      ref: "v2",
      subpath: "path/SKILL.md",
    });
    // ref but no subpath
    expect(parseSource("https://github.com/owner/repo/tree/dev")).toEqual({
      type: "github",
      repo: "owner/repo",
      ref: "dev",
    });
  });

  test("plain github web repo URLs fall through to git", () => {
    expect(parseSource("https://github.com/owner/repo")).toEqual({
      type: "git",
      url: "https://github.com/owner/repo",
    });
    expect(parseSource("https://github.com/owner/repo.git")).toEqual({
      type: "git",
      url: "https://github.com/owner/repo.git",
    });
  });
});

describe("parseSource — forge web URLs (gitlab, gitea)", () => {
  test("gitlab /-/tree and /-/blob → git source", () => {
    expect(parseSource("https://gitlab.com/owner/repo/-/tree/main/skills/foo")).toEqual({
      type: "git",
      url: "https://gitlab.com/owner/repo.git",
      ref: "main",
      subpath: "skills/foo",
    });
    expect(parseSource("https://gitlab.com/owner/repo/-/blob/v2/path/SKILL.md")).toEqual({
      type: "git",
      url: "https://gitlab.com/owner/repo.git",
      ref: "v2",
      subpath: "path/SKILL.md",
    });
  });

  test("gitlab nested groups keep the full project path", () => {
    expect(parseSource("https://gitlab.com/group/sub/repo/-/tree/main/skills/foo")).toEqual({
      type: "git",
      url: "https://gitlab.com/group/sub/repo.git",
      ref: "main",
      subpath: "skills/foo",
    });
  });

  test("gitea/forgejo /src/branch|commit|tag → git source", () => {
    expect(parseSource("https://gitea.com/owner/repo/src/branch/main/skills/foo")).toEqual({
      type: "git",
      url: "https://gitea.com/owner/repo.git",
      ref: "main",
      subpath: "skills/foo",
    });
    expect(parseSource("https://gitea.com/owner/repo/src/commit/abc123/skills/foo")).toEqual({
      type: "git",
      url: "https://gitea.com/owner/repo.git",
      ref: "abc123",
      subpath: "skills/foo",
    });
    expect(parseSource("https://gitea.com/owner/repo/src/tag/v1.0/skills/foo")).toEqual({
      type: "git",
      url: "https://gitea.com/owner/repo.git",
      ref: "v1.0",
      subpath: "skills/foo",
    });
  });

  test("self-hosted instances are recognised by the path marker", () => {
    expect(parseSource("https://git.example.com/g/sub/repo/-/tree/dev/foo")).toEqual({
      type: "git",
      url: "https://git.example.com/g/sub/repo.git",
      ref: "dev",
      subpath: "foo",
    });
    expect(parseSource("https://gitea.internal:3000/owner/repo/src/branch/main/foo")).toEqual({
      type: "git",
      url: "https://gitea.internal:3000/owner/repo.git",
      ref: "main",
      subpath: "foo",
    });
  });

  test("plain forge repo URLs fall through to git unchanged", () => {
    expect(parseSource("https://gitlab.com/owner/repo")).toEqual({
      type: "git",
      url: "https://gitlab.com/owner/repo",
    });
  });
});

describe("parseSource — npm", () => {
  test("scheme, version and scopes", () => {
    expect(parseSource("npm:pkg")).toEqual({ type: "npm", package: "pkg" });
    expect(parseSource("pkg@1.2.3")).toEqual({ type: "npm", package: "pkg", version: "1.2.3" });
    expect(parseSource("@scope/pkg")).toEqual({ type: "npm", package: "@scope/pkg" });
    expect(parseSource("@scope/pkg@1.0.0")).toEqual({
      type: "npm",
      package: "@scope/pkg",
      version: "1.0.0",
    });
    expect(parseSource("lodash")).toEqual({ type: "npm", package: "lodash" });
  });
});

describe("parseSource — tarball", () => {
  test("scheme and archive extensions", () => {
    expect(parseSource("tarball:https://h/a.tgz")).toEqual({ type: "tarball", url: "https://h/a.tgz" });
    expect(parseSource("https://h/a.tar.gz")).toEqual({ type: "tarball", url: "https://h/a.tar.gz" });
    expect(parseSource("https://h/a.zip")).toEqual({ type: "tarball", url: "https://h/a.zip" });
  });
});

describe("parseSource — guards", () => {
  test("rejects empty input", () => {
    expect(() => parseSource("   ")).toThrow(/Empty/);
  });
});
