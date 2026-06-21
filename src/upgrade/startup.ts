/**
 * Startup self-management. A single throttled check (once per day, cached in the global home) drives
 * two behaviors when a newer release exists:
 *  - auto-upgrade (the default): install it and re-exec the same command on the new version;
 *  - otherwise (opted out, or the install failed): a passive "update available" notice.
 *
 * Everything here is best-effort: it never throws and never blocks the command the user actually ran.
 */

import { spawn } from "node:child_process";
import { join } from "node:path";
import { homeDir } from "../config/paths";
import { envVars, files, pkg } from "../constants";
import { readJson, writeJson } from "../util/fs";
import {
  checkForUpgrade,
  detectPackageManager,
  installLatest,
  isNewer,
  upgradeCommandLine,
} from "./upgrade";

/** Hit the registry at most once per this window; the result is cached between runs in the home. */
const checkIntervalMs = 1000 * 60 * 60 * 24;

/** Persisted between runs so we don't reach the network on every invocation. */
type UpdateCheckCache = { checkedAt: number; latest: string };

/** A truthy, non-falsey env value. */
function flag(value: string | undefined): boolean {
  return !!value && value !== "0" && value.toLowerCase() !== "false";
}

/** Auto-upgrade runs by default; opt out with a truthy SKILLMESH_NO_AUTO_UPGRADE. */
export function isAutoUpgradeEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return !flag(env[envVars.noAutoUpgrade]);
}

/**
 * Throttled latest-version lookup. Returns the latest version and whether it came from a live
 * network call (`fresh`) versus the cache. Returns null only when there's nothing to go on.
 */
async function throttledLatest(
  env: NodeJS.ProcessEnv,
): Promise<{ latest: string; fresh: boolean } | null> {
  const cachePath = join(homeDir(env), files.updateCheck);
  const cache = await readJson<UpdateCheckCache>(cachePath);
  const now = Date.now();

  if (cache && now - cache.checkedAt < checkIntervalMs) {
    return { latest: cache.latest, fresh: false };
  }
  try {
    const { latest } = await checkForUpgrade({ timeoutMs: 3000 });
    await writeJson(cachePath, { checkedAt: now, latest });
    return { latest, fresh: true };
  } catch {
    // Registry unreachable or package not published: back off, reusing any prior known version.
    await writeJson(cachePath, { checkedAt: now, latest: cache?.latest ?? pkg.version });
    return cache ? { latest: cache.latest, fresh: false } : null;
  }
}

/** Print the "update available" notice to stderr so it never contaminates piped stdout. */
export function printNotice(latest: string): void {
  const cmd = upgradeCommandLine(detectPackageManager());
  process.stderr.write(
    `\nUpdate available for skillmesh: ${pkg.version} → ${latest}\n` +
      `Run 'skillmesh upgrade' (or '${cmd}') to update.\n\n`,
  );
}

/** Re-run the same command (same node + script path, now holding the new code) and mirror its exit. */
function reexec(argv: string[], env: NodeJS.ProcessEnv): Promise<never> {
  return new Promise(() => {
    const [node, script, ...rest] = argv;
    if (!node || !script) {
      process.exit(0);
      return;
    }
    const child = spawn(node, [script, ...rest], {
      stdio: "inherit",
      env: { ...env, [envVars.upgradeGuard]: "1" },
    });
    child.on("error", () => process.exit(1));
    child.on("exit", (code, signal) => {
      if (signal) process.kill(process.pid, signal);
      else process.exit(code ?? 0);
    });
  });
}

/**
 * Run the startup check. May install a newer release and re-exec (never returning); otherwise
 * resolves with an optional `notice` the caller should print *after* the command completes.
 */
export async function startupSelfManage(
  env: NodeJS.ProcessEnv = process.env,
  argv: string[] = process.argv,
): Promise<{ notice?: string }> {
  try {
    if (env[envVars.upgradeGuard]) return {}; // this run is already the re-exec'd child
    const result = await throttledLatest(env);
    if (!result || !isNewer(result.latest, pkg.version)) return {};

    // Auto-upgrade only on a fresh (network) check, so a persistently failing install isn't retried
    // on every command within the throttle window.
    if (isAutoUpgradeEnabled(env) && result.fresh) {
      try {
        process.stderr.write(`Auto-upgrading skillmesh ${pkg.version} → ${result.latest}…\n`);
        await installLatest();
        await reexec(argv, env); // never resolves; the process exits via the child's handlers
      } catch {
        // Install failed (e.g. no permission to the global prefix): fall back to the notice.
      }
    }

    return flag(env[envVars.skipUpdateCheck]) ? {} : { notice: result.latest };
  } catch {
    return {}; // a self-management failure must never disrupt the actual command
  }
}
