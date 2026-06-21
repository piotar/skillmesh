/** Pure helpers for manipulating lockfile entries (no IO). */

import type { LockEntry, Lockfile } from "../types";

/** Sort entries by name for deterministic output. */
function sorted(skills: LockEntry[]): LockEntry[] {
  return [...skills].sort((a, b) => a.name.localeCompare(b.name));
}

/** Insert or replace an entry by name. */
export function upsertEntry(lock: Lockfile, entry: LockEntry): Lockfile {
  const others = lock.skills.filter((s) => s.name !== entry.name);
  return { version: lock.version || 1, skills: sorted([...others, entry]) };
}

/** Remove an entry by name. */
export function removeEntry(lock: Lockfile, name: string): Lockfile {
  return { version: lock.version || 1, skills: lock.skills.filter((s) => s.name !== name) };
}

/** Find an entry by name. */
export function findEntry(lock: Lockfile, name: string): LockEntry | undefined {
  return lock.skills.find((s) => s.name === name);
}
