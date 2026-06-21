/**
 * Per-host credentials for private sources (git over HTTPS, tarball downloads).
 *
 * Tokens live in `~/.skillmesh/auth.json`, keyed by host — one self-contained place, so updating many
 * private repos needs no environment juggling. Credentials are injected at fetch time and are NEVER
 * written into a persisted SourceSpec (lockfile / sidecar), so a token typed once cannot leak into a
 * project. A token value of the form `${ENV_NAME}` is expanded from the environment at read time, as
 * an optional convenience for CI; a raw token is the primary, fully-supported path.
 */

import { chmod } from "node:fs/promises";
import { authConfigPath } from "./paths";
import { readJson, writeJson } from "../util/fs";

/** How a host's token is presented on the wire. */
export type AuthScheme = "basic" | "bearer" | "private-token";

/** Credentials for a single host. */
export type HostAuth = {
  token: string;
  /** Defaults to "basic" (token as password). */
  scheme?: AuthScheme;
  /** Only used by "basic"; defaults to "oauth2" (works for GitLab; ignored by GitHub PATs). */
  username?: string;
};

/** The auth file: host -> credentials. */
export type AuthConfig = {
  version: number;
  hosts: Record<string, HostAuth>;
};

/** A ready-to-send HTTP header. */
export type AuthHeader = { name: string; value: string };

/** The auth config used when none has been written yet. */
function defaultAuthConfig(): AuthConfig {
  return { version: 1, hosts: {} };
}

/** Read the auth file, falling back to an empty config when it does not exist. */
export async function readAuthConfig(home?: string): Promise<AuthConfig> {
  const data = await readJson<AuthConfig>(authConfigPath(home));
  return data ?? defaultAuthConfig();
}

/** Persist the auth file, then restrict its permissions to the owner (best-effort; no-op on Windows). */
export async function writeAuthConfig(config: AuthConfig, home?: string): Promise<void> {
  const path = authConfigPath(home);
  await writeJson(path, config);
  try {
    await chmod(path, 0o600);
  } catch {
    // Best-effort: chmod is meaningless on Windows and not worth failing a write over.
  }
}

/** Normalize a host for keying: lowercase, port stripped. */
function normalizeHost(host: string): string {
  return host.toLowerCase().replace(/:\d+$/, "");
}

/** Expand a `${ENV_NAME}` token value from the environment; pass any other value through unchanged. */
function expandToken(token: string, env: NodeJS.ProcessEnv): string {
  const m = /^\$\{([^}]+)\}$/.exec(token);
  return m ? (env[m[1]!] ?? "") : token;
}

/**
 * Look up credentials for a host. Matching is exact on the normalized host; the returned token has any
 * `${ENV}` reference resolved. Returns undefined when there is no entry (or its token resolves empty).
 */
export function lookupHostAuth(
  host: string,
  config: AuthConfig,
  env: NodeJS.ProcessEnv = process.env,
): HostAuth | undefined {
  const entry = config.hosts[normalizeHost(host)];
  if (!entry) return undefined;
  const token = expandToken(entry.token, env);
  if (!token) return undefined;
  return { ...entry, token };
}

/** Build the HTTP header that presents a host's credentials, per its scheme (default "basic"). */
export function authHeader(auth: HostAuth): AuthHeader {
  switch (auth.scheme ?? "basic") {
    case "bearer":
      return { name: "Authorization", value: `Bearer ${auth.token}` };
    case "private-token":
      return { name: "PRIVATE-TOKEN", value: auth.token };
    case "basic": {
      const user = auth.username ?? "oauth2";
      const encoded = Buffer.from(`${user}:${auth.token}`).toString("base64");
      return { name: "Authorization", value: `Basic ${encoded}` };
    }
  }
}

/**
 * Extract the host from a source reference. Handles HTTPS/HTTP URLs and the `git@host:path` SSH form.
 * Returns undefined when no host can be determined (e.g. a local path).
 */
export function hostOf(url: string): string | undefined {
  const scp = /^[^@/]+@([^:/]+):/.exec(url);
  if (scp) return normalizeHost(scp[1]!);
  try {
    return normalizeHost(new URL(url).hostname);
  } catch {
    return undefined;
  }
}

/**
 * Resolve the auth header to inject for a URL, or undefined when there is no matching credential.
 * A convenience wrapper that reads the config, finds the host and builds the header.
 */
export async function headerForUrl(url: string, home?: string): Promise<AuthHeader | undefined> {
  const host = hostOf(url);
  if (!host) return undefined;
  const auth = lookupHostAuth(host, await readAuthConfig(home));
  return auth ? authHeader(auth) : undefined;
}
