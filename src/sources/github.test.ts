import { describe, expect, test } from "bun:test";
import { githubToGitSource } from "./github";

describe("githubToGitSource", () => {
  test("maps a shorthand to an https clone URL", () => {
    expect(githubToGitSource({ type: "github", repo: "owner/repo" })).toEqual({
      type: "git",
      url: "https://github.com/owner/repo.git",
    });
  });

  test("carries ref and subpath through", () => {
    expect(
      githubToGitSource({ type: "github", repo: "owner/repo", ref: "v1", subpath: "skills/foo" }),
    ).toEqual({
      type: "git",
      url: "https://github.com/owner/repo.git",
      ref: "v1",
      subpath: "skills/foo",
    });
  });
});
