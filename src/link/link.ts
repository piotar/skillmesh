/**
 * Materialize a store skill into a project's skills directory.
 *
 * Default mode is "link": a junction on Windows (no admin rights required) or a directory
 * symlink on POSIX. Mode "copy" makes an independent copy. Uninstalling only removes the
 * link/copy in the project — never the store content it points at.
 */

import { lstat, rm, stat, symlink } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import type { InstallMode } from "../types";
import { copyDir, ensureDir } from "../util/fs";

/** State of an installed skill path within a project. */
export type LinkStatus = "missing" | "link" | "dir" | "broken";

/** Directory links must be junctions on Windows; POSIX uses regular directory symlinks. */
const linkType: "junction" | "dir" = process.platform === "win32" ? "junction" : "dir";

/** Whether a path exists without following symlinks (so broken links count as present). */
async function linkExists(path: string): Promise<boolean> {
  try {
    await lstat(path);
    return true;
  } catch {
    return false;
  }
}

/**
 * Install a store skill into a project at `dest`.
 * Throws if `dest` already exists — callers replace by uninstalling first.
 */
export async function installSkill(
  target: string,
  dest: string,
  mode: InstallMode,
): Promise<void> {
  if (await linkExists(dest)) throw new Error(`Destination already exists: ${dest}`);
  await ensureDir(dirname(dest));

  if (mode === "copy") {
    await copyDir(target, dest);
  } else {
    await symlink(resolve(target), dest, linkType);
  }
}

/** Remove an installed skill (link or copy) from a project, leaving the store untouched. */
export async function uninstallSkill(dest: string): Promise<void> {
  await rm(dest, { recursive: true, force: true });
}

/** Report whether an installed path is missing, a (working) link, a real directory, or broken. */
export async function linkStatus(dest: string): Promise<LinkStatus> {
  let info: Awaited<ReturnType<typeof lstat>>;
  try {
    info = await lstat(dest);
  } catch {
    return "missing";
  }

  // Junctions and symlinks both surface as symbolic links via lstat.
  if (info.isSymbolicLink()) {
    try {
      await stat(dest); // follows the link; throws when the target is gone
      return "link";
    } catch {
      return "broken";
    }
  }

  return info.isDirectory() ? "dir" : "broken";
}
