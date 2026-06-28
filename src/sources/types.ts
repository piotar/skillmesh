/** Common contract for skill sources: how to materialize a SourceSpec into a local directory. */

import type { SourceSpec } from "../types";

/** The outcome of fetching a source. */
export type FetchResult = {
  /** Directory containing the skill content (a SKILL.md at its root). */
  dir: string;
  /** Resolved version identity used for updates (git commit, content hash, npm version). */
  version: string;
  /** Removes any temporary directory created while fetching (no-op for in-place sources). */
  cleanup: () => Promise<void>;
};

/** A fetcher materializes one kind of source into a local directory. */
export type Fetcher<S extends SourceSpec = SourceSpec> = (source: S) => Promise<FetchResult>;

/**
 * The raw outcome of downloading a source, before resolving/validating a specific entry directory
 * (a skill's SKILL.md or a plugin's package.json). `version` is set when the source carries an
 * intrinsic identity (git commit, npm version); otherwise it's derived from the resolved content.
 */
export type Materialized = {
  /** Root directory of the downloaded content; a subpath is applied to this. */
  root: string;
  /** Intrinsic version, when the source provides one (git commit, npm version). */
  version?: string;
  /** Removes any temporary directory created while materializing (no-op for in-place sources). */
  cleanup: () => Promise<void>;
};

/** A materialized source whose version is intrinsic, so it's always present (git, npm). */
export type VersionedMaterialized = Materialized & { version: string };
