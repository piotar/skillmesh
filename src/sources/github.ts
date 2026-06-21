/** Fetch a skill from a GitHub `owner/repo` shorthand by delegating to the git fetcher. */

import type { GithubSource, GitSource } from "../types";
import { fetchGit, materializeGit } from "./git";
import type { Fetcher, Materialized } from "./types";

/** Translate a GitHub shorthand into an equivalent git source (https clone URL). */
export function githubToGitSource(source: GithubSource): GitSource {
  const git: GitSource = { type: "git", url: `https://github.com/${source.repo}.git` };
  if (source.ref) git.ref = source.ref;
  if (source.subpath) git.subpath = source.subpath;
  return git;
}

export function materializeGithub(source: GithubSource): Promise<Materialized> {
  return materializeGit(githubToGitSource(source));
}

export const fetchGithub: Fetcher<GithubSource> = (source) => fetchGit(githubToGitSource(source));
