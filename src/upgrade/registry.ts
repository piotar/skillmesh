/**
 * Resolve the npm registry (and any auth token) to use for the version check, honoring `.npmrc`
 * so private/enterprise registries work. We read config directly rather than shelling out to npm,
 * because skillmesh may have been installed without npm present (Bun, pnpm, yarn). The `.npmrc`
 * format is the de-facto standard those managers read too.
 */

import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

/** A registry endpoint and the bearer token to send with it, if one is configured. */
export type RegistryConfig = { url: string; token?: string };

const defaultRegistry = "https://registry.npmjs.org";

/** Parse `key=value` `.npmrc` lines into a map (ignoring blanks and `#`/`;` comments). */
export function parseNpmrc(text: string): Map<string, string> {
  const config = new Map<string, string>();
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#") || line.startsWith(";")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    const value = line
      .slice(eq + 1)
      .trim()
      .replace(/^["'](.*)["']$/, "$1");
    if (key) config.set(key, value);
  }
  return config;
}

/** Expand `${VAR}` references in a config value from the environment (common for auth tokens). */
function expand(value: string, env: NodeJS.ProcessEnv): string {
  return value.replace(/\$\{([^}]+)\}/g, (_, name: string) => env[name] ?? "");
}

/** Find the `_authToken` whose `//host[/path]/:_authToken` key best matches the registry URL. */
function tokenFor(url: string, config: Map<string, string>, env: NodeJS.ProcessEnv): string | undefined {
  let target: URL;
  try {
    target = new URL(url);
  } catch {
    return undefined;
  }
  const targetKey = `${target.host}${target.pathname}`.replace(/\/+$/, "");
  let best: { length: number; token: string } | undefined;
  for (const [key, value] of config) {
    const match = key.match(/^\/\/(.+?)\/?:_authToken$/);
    if (!match) continue;
    const scope = match[1]!;
    if (targetKey === scope || targetKey.startsWith(`${scope}/`)) {
      if (!best || scope.length > best.length) best = { length: scope.length, token: expand(value, env) };
    }
  }
  return best?.token || undefined;
}

/** Build the effective config from already-merged `.npmrc` settings (pure; unit-tested). */
export function registryFromConfig(config: Map<string, string>, env: NodeJS.ProcessEnv): RegistryConfig {
  const fromEnv = env.npm_config_registry ?? env.NPM_CONFIG_REGISTRY;
  const url = (fromEnv || config.get("registry") || defaultRegistry).replace(/\/+$/, "");
  const token = tokenFor(url, config, env);
  return token ? { url, token } : { url };
}

/** Read user then project `.npmrc` (project wins), then apply env overrides, to pick the registry. */
export async function resolveRegistry(
  env: NodeJS.ProcessEnv = process.env,
  cwd: string = process.cwd(),
): Promise<RegistryConfig> {
  const merged = new Map<string, string>();
  // Lowest precedence first: ~/.npmrc, then ./.npmrc overrides it (env is applied in registryFromConfig).
  for (const file of [join(homedir(), ".npmrc"), join(cwd, ".npmrc")]) {
    let text: string;
    try {
      text = await readFile(file, "utf8");
    } catch {
      continue;
    }
    for (const [key, value] of parseNpmrc(text)) merged.set(key, value);
  }
  return registryFromConfig(merged, env);
}
