/** Shared helpers for source fetchers: process execution, temp dirs and skill-dir resolution. */

import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import spawn from "cross-spawn";
import { files } from "../constants";
import { isDirectory, pathExists, readJson } from "../util/fs";

/** The npm executable name (npm ships as npm.cmd on Windows). */
export const npmBin = process.platform === "win32" ? "npm.cmd" : "npm";

/** Create a unique temporary directory for a fetch. */
export function makeTempDir(prefix = "skillmesh-fetch-"): Promise<string> {
  return mkdtemp(join(tmpdir(), prefix));
}

/**
 * Run a command, returning trimmed stdout and throwing with stderr on a non-zero exit.
 * Uses cross-spawn so Windows `.cmd` shims (e.g. npm.cmd) work under both Node and Bun.
 */
export function exec(cmd: string[], opts: { cwd?: string; timeoutMs?: number } = {}): Promise<string> {
  const [bin, ...args] = cmd;
  if (!bin) throw new Error("exec called with an empty command");
  return new Promise((resolve, reject) => {
    const proc = spawn(bin, args, { cwd: opts.cwd, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    const timer = opts.timeoutMs
      ? setTimeout(() => {
          proc.kill();
          reject(new Error(`Command timed out after ${opts.timeoutMs}ms: ${cmd.join(" ")}`));
        }, opts.timeoutMs)
      : undefined;
    proc.stdout?.on("data", (chunk: Buffer) => (stdout += chunk.toString()));
    proc.stderr?.on("data", (chunk: Buffer) => (stderr += chunk.toString()));
    proc.on("error", (err) => {
      if (timer) clearTimeout(timer);
      reject(err);
    });
    proc.on("close", (code) => {
      if (timer) clearTimeout(timer);
      if (code !== 0) {
        reject(new Error(`Command failed (exit ${code}): ${cmd.join(" ")}\n${stderr.trim()}`));
      } else {
        resolve(stdout.trim());
      }
    });
  });
}

/**
 * Resolve the actual skill directory within a fetched root and verify it is a valid skill.
 * Applies the optional subpath and requires a SKILL.md at the resulting location.
 */
export async function resolveSkillDir(root: string, subpath?: string): Promise<string> {
  const dir = subpath ? join(root, subpath) : root;
  if (!(await isDirectory(dir))) {
    throw new Error(`Skill directory not found: ${dir}`);
  }
  if (!(await pathExists(join(dir, files.skill)))) {
    throw new Error(`No ${files.skill} found in ${dir}`);
  }
  return dir;
}

/** The `skillmesh` field a plugin package declares in its package.json. */
export type PluginManifest = { plugin: string; apiVersion: number };

/**
 * Resolve the plugin directory within a materialized root and read its manifest.
 * A plugin is a package.json carrying a `skillmesh` field with an entry path and API version.
 */
export async function resolvePluginDir(
  root: string,
  subpath?: string,
): Promise<{ dir: string; manifest: PluginManifest }> {
  const dir = subpath ? join(root, subpath) : root;
  if (!(await isDirectory(dir))) {
    throw new Error(`Plugin directory not found: ${dir}`);
  }
  const pkg = await readJson<{ skillmesh?: PluginManifest }>(join(dir, files.packageJson));
  if (!pkg?.skillmesh?.plugin) {
    throw new Error(`No plugin manifest in ${dir} (expected a 'skillmesh.plugin' field in ${files.packageJson})`);
  }
  return { dir, manifest: pkg.skillmesh };
}
