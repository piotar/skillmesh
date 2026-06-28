/** Parse a free-form source string (as typed on the CLI) into a typed SourceSpec. */

import { resolve } from "node:path";
import type {
  GitSource,
  GithubSource,
  NpmSource,
  SourceSpec,
  TarballSource,
} from "../types";
import { parseViaPlugins } from "../plugin/host";

/** Split a `value#ref` string into its value and optional ref. */
function splitRef(value: string): { value: string; ref?: string } {
  const i = value.indexOf("#");
  return i === -1 ? { value } : { value: value.slice(0, i), ref: value.slice(i + 1) || undefined };
}

/**
 * Canonicalize a local path to absolute so presets (stored in the global, cross-project config)
 * resolve the same regardless of the working directory at apply time. `~`-rooted paths are left
 * untouched — they expand at materialization and stay portable across machines.
 */
function normalizeLocalPath(path: string): string {
  return path === "~" || path.startsWith("~/") || path.startsWith("~\\") ? path : resolve(path);
}

/** Canonicalize a source's local path (no-op for non-local sources). */
export function normalizeSource(source: SourceSpec): SourceSpec {
  return source.type === "local" ? { ...source, path: normalizeLocalPath(source.path) } : source;
}

/** Whether a string looks like a filesystem path rather than a remote reference. */
function isPathLike(input: string): boolean {
  return (
    input.startsWith(".") ||
    input.startsWith("/") ||
    input.startsWith("~") ||
    input.startsWith("\\\\") ||
    /^[A-Za-z]:[\\/]/.test(input)
  );
}

/** Build a git source from a URL that may carry a `#ref`. */
function gitSpec(url: string): GitSource {
  const { value, ref } = splitRef(url);
  return ref ? { type: "git", url: value, ref } : { type: "git", url: value };
}

/** Build a github source from an `owner/repo` shorthand that may carry a `#ref`. */
function githubSpec(repo: string): GithubSource {
  const { value, ref } = splitRef(repo);
  if (!/^[^/]+\/[^/]+$/.test(value)) {
    throw new Error(`Invalid GitHub repo shorthand: '${value}' (expected 'owner/repo')`);
  }
  return ref ? { type: "github", repo: value, ref } : { type: "github", repo: value };
}

/**
 * Locate the forge-specific marker that separates the repository/project path from the trailing
 * `<ref>/<subpath>` in a browseable web URL. Returns the segment count forming the project path
 * and the index of the ref segment, or undefined when no known marker is present.
 *
 *   GitHub          owner/repo/tree|blob/<ref>/<subpath>
 *   GitLab          group/.../repo/-/tree|blob/<ref>/<subpath>   (project may be a nested group)
 *   Gitea/Forgejo   owner/repo/src/branch|commit|tag/<ref>/<subpath>
 */
function locateForgeMarker(
  segments: string[],
): { projectEnd: number; refIndex: number } | undefined {
  for (let i = 0; i < segments.length; i++) {
    const next = segments[i + 1];
    // GitLab: the `/-/` separator precedes a `tree`/`blob` browse path.
    if (segments[i] === "-" && (next === "tree" || next === "blob")) {
      return { projectEnd: i, refIndex: i + 2 };
    }
    // Gitea/Forgejo: `/src/branch|commit|tag/<ref>/…`.
    if (segments[i] === "src" && (next === "branch" || next === "commit" || next === "tag")) {
      return { projectEnd: i, refIndex: i + 2 };
    }
    // GitHub: a bare `tree`/`blob` directly after `owner/repo` (no `/-/` separator).
    if ((segments[i] === "tree" || segments[i] === "blob") && i >= 2 && segments[i - 1] !== "-") {
      return { projectEnd: i, refIndex: i + 1 };
    }
  }
  return undefined;
}

/**
 * Parse a forge web URL (a browseable `tree`/`blob`/`src` link) into a source carrying the ref and
 * subpath. github.com yields a github source (for the nicer shorthand); every other host — GitLab,
 * Gitea/Forgejo and self-hosted instances of either — yields a git source whose clone URL is the
 * project path with a `.git` suffix. Returns undefined for plain repo URLs and unrecognised shapes,
 * which fall through to the git fetcher and clone directly.
 */
function webUrlSpec(url: string): SourceSpec | undefined {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return undefined;
  }
  const segments = parsed.pathname.split("/").filter(Boolean);
  const marker = locateForgeMarker(segments);
  if (!marker) return undefined;

  const projectPath = segments.slice(0, marker.projectEnd).join("/").replace(/\.git$/, "");
  const ref = segments[marker.refIndex];
  // A project path needs at least `owner/repo`; a marker without a ref is not a browse URL.
  if (!projectPath.includes("/") || !ref) return undefined;
  const subpath = segments.slice(marker.refIndex + 1).join("/");

  if (parsed.hostname === "github.com" || parsed.hostname === "www.github.com") {
    const spec: GithubSource = { type: "github", repo: projectPath, ref };
    if (subpath) spec.subpath = subpath;
    return spec;
  }
  const spec: GitSource = {
    type: "git",
    url: `${parsed.protocol}//${parsed.host}/${projectPath}.git`,
    ref,
  };
  if (subpath) spec.subpath = subpath;
  return spec;
}

/** Build an npm source from a `package` or `package@version` (scope-aware). */
function npmSpec(spec: string): NpmSource {
  const at = spec.lastIndexOf("@");
  if (at > 0) {
    return { type: "npm", package: spec.slice(0, at), version: spec.slice(at + 1) };
  }
  return { type: "npm", package: spec };
}

/** Build a tarball source from an archive URL. */
function tarballSpec(url: string): TarballSource {
  return { type: "tarball", url };
}

/** Whether a URL points at a downloadable archive by extension. */
function isArchiveUrl(url: string): boolean {
  return /\.(tar\.gz|tgz|tar|zip)$/.test(splitRef(url).value);
}

/**
 * Parse a source string into a SourceSpec.
 * Explicit schemes (`file:`, `git+`, `github:`, `npm:`, `tarball:`) win; otherwise heuristics apply:
 * paths -> local, archive URLs -> tarball, git-ish URLs -> git, `owner/repo` -> github, else npm.
 */
export function parseSource(input: string): SourceSpec {
  const raw = input.trim();
  if (raw.length === 0) throw new Error("Empty source");

  if (raw.startsWith("file:"))
    return { type: "local", path: normalizeLocalPath(raw.slice("file:".length)) };
  if (raw.startsWith("git+")) return gitSpec(raw.slice("git+".length));
  if (raw.startsWith("github:")) return githubSpec(raw.slice("github:".length));
  if (raw.startsWith("npm:")) return npmSpec(raw.slice("npm:".length));
  if (raw.startsWith("tarball:")) return tarballSpec(raw.slice("tarball:".length));

  // A plugin adapter may claim its own `scheme:` prefix; checked before the built-in heuristics so
  // a registered scheme always wins. No-op when no plugins are loaded (the host is empty).
  const viaPlugin = parseViaPlugins(raw);
  if (viaPlugin) return viaPlugin;

  if (isPathLike(raw)) return { type: "local", path: normalizeLocalPath(raw) };

  if (/^https?:\/\//.test(raw)) {
    if (isArchiveUrl(raw)) return tarballSpec(raw);
    const web = webUrlSpec(raw);
    if (web) return web;
    return gitSpec(raw);
  }
  if (/^git@/.test(raw) || /\.git(#|$)/.test(raw)) return gitSpec(raw);

  if (raw.startsWith("@")) return npmSpec(raw); // scoped npm package
  if (/^[^/]+\/[^/]+$/.test(splitRef(raw).value)) return githubSpec(raw);

  return npmSpec(raw);
}
