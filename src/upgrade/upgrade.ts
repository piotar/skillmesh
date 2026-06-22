/**
 * Upgrade: check the npm registry for a newer skillmesh and replace the global install.
 *
 * Two deliberate independence choices, so this works regardless of how skillmesh was installed:
 *  - the version check hits the npm registry over HTTP (no `npm` binary required — works under Bun too);
 *  - the install uses whichever package manager actually installed the CLI, detected from the bin path.
 */

import { realpathSync } from "node:fs";
import { pkg } from "../constants";
import { exec } from "../sources/util";
import { resolveRegistry } from "./registry";

/** Package managers that can install a global package; the one in use is detected at runtime. */
export type PackageManager = "npm" | "bun" | "pnpm" | "yarn";

/** Outcome of comparing the running version against the latest published one. */
export type UpgradeCheck = {
  /** Version of the running CLI (from `pkg.version`). */
  current: string;
  /** Latest version published to the npm registry. */
  latest: string;
  /** Whether `latest` is strictly newer than `current`. */
  hasUpdate: boolean;
};

/** Parse a semver string into its numeric [major, minor, patch], ignoring pre-release/build metadata. */
function core(v: string): [number, number, number] {
  const base = v.trim().replace(/^v/, "").split("+")[0]!.split("-")[0]!;
  const parts = base.split(".").map((n) => Number.parseInt(n, 10));
  return [parts[0] ?? 0, parts[1] ?? 0, parts[2] ?? 0];
}

/** True when `candidate` is a strictly higher release than `base` (pre-release tags are not considered). */
export function isNewer(candidate: string, base: string): boolean {
  const a = core(candidate);
  const b = core(base);
  for (let i = 0; i < 3; i++) {
    if (a[i]! > b[i]!) return true;
    if (a[i]! < b[i]!) return false;
  }
  return false;
}

/**
 * Fetch the version behind the package's `latest` dist-tag straight from the registry.
 * The registry (and any auth token) is resolved from `.npmrc`, so private registries work.
 */
export async function latestVersion(opts: { timeoutMs?: number } = {}): Promise<string> {
  const registry = await resolveRegistry();
  const headers: Record<string, string> = { accept: "application/vnd.npm.install-v1+json" };
  if (registry.token) headers.authorization = `Bearer ${registry.token}`;
  // Fetch the full packument, not `/{pkg}/latest`: the abbreviated install-v1 media type is only
  // negotiable on the packument endpoint. Registry proxies (Artifactory/Nexus/Verdaccio) return
  // 406 Not Acceptable when that Accept header hits the version-specific endpoint.
  const res = await fetch(`${registry.url}/${pkg.name}`, {
    headers,
    signal: opts.timeoutMs ? AbortSignal.timeout(opts.timeoutMs) : undefined,
  });
  if (!res.ok) throw new Error(`Registry returned ${res.status} for ${pkg.name}`);
  const data = (await res.json()) as { "dist-tags"?: { latest?: unknown } };
  const latest = data["dist-tags"]?.latest;
  if (typeof latest !== "string") {
    throw new Error(`Unexpected registry response for ${pkg.name}`);
  }
  return latest;
}

/** Compare the running version against the registry's latest. */
export async function checkForUpgrade(opts: { timeoutMs?: number } = {}): Promise<UpgradeCheck> {
  const latest = await latestVersion(opts);
  return { current: pkg.version, latest, hasUpdate: isNewer(latest, pkg.version) };
}

/**
 * Best-effort guess of which package manager installed this CLI, from the running bin's real path.
 * Global installs land in manager-specific directories (`~/.bun/…`, `pnpm/…`, `yarn/…`); npm is the default.
 */
export function detectPackageManager(execPath: string = process.argv[1] ?? ""): PackageManager {
  let resolved = execPath;
  try {
    resolved = realpathSync(execPath);
  } catch {
    // Fall back to the unresolved path (e.g. when the bin no longer exists at the recorded location).
  }
  const norm = resolved.replace(/\\/g, "/").toLowerCase();
  if (norm.includes("/.bun/") || norm.includes("/bun/")) return "bun";
  if (norm.includes("/pnpm/") || norm.includes("/.pnpm/")) return "pnpm";
  if (norm.includes("/yarn/")) return "yarn";
  return "npm";
}

/** The executable name per manager (Windows ships npm/pnpm/yarn as `.cmd` shims; bun is a real `.exe`). */
const managerBin: Record<PackageManager, string> = {
  npm: process.platform === "win32" ? "npm.cmd" : "npm",
  bun: process.platform === "win32" ? "bun.exe" : "bun",
  pnpm: process.platform === "win32" ? "pnpm.cmd" : "pnpm",
  yarn: process.platform === "win32" ? "yarn.cmd" : "yarn",
};

/** The global-install argument vector per manager, targeting the `latest` dist-tag. */
const managerArgs: Record<PackageManager, string[]> = {
  npm: ["install", "-g", `${pkg.name}@latest`],
  bun: ["add", "-g", `${pkg.name}@latest`],
  pnpm: ["add", "-g", `${pkg.name}@latest`],
  yarn: ["global", "add", `${pkg.name}@latest`],
};

/** The shell command a user would run to upgrade by hand with the detected manager. */
export function upgradeCommandLine(pm: PackageManager = detectPackageManager()): string {
  return [managerBin[pm].replace(/\.(cmd|exe)$/, ""), ...managerArgs[pm]].join(" ");
}

/** Install the latest published release globally with the detected manager, returning which one was used. */
export async function installLatest(
  pm: PackageManager = detectPackageManager(),
): Promise<PackageManager> {
  await exec([managerBin[pm], ...managerArgs[pm]]);
  return pm;
}
