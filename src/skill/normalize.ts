/** Normalize arbitrary strings into spec-compliant skill names and resolve naming conflicts. */

/** Maximum length of a skill name per the agentskills.io spec. */
const maxNameLength = 64;

/** Fallback used when an input normalizes to an empty string. */
const fallbackName = "skill";

/** Convert an arbitrary string into a spec-compliant skill name (kebab-case, a-z0-9-, <=64). */
export function normalizeName(input: string): string {
  let name = input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-") // non-alphanumeric runs -> single hyphen
    .replace(/-+/g, "-") // collapse consecutive hyphens
    .replace(/^-+|-+$/g, ""); // trim leading/trailing hyphens

  if (name.length > maxNameLength) {
    name = name.slice(0, maxNameLength).replace(/-+$/g, "");
  }

  return name.length > 0 ? name : fallbackName;
}

/**
 * Return a unique, spec-compliant name not present in `taken`, appending `-2`, `-3`, …
 * The numeric suffix is preserved even if it means truncating the base to stay within 64 chars.
 */
export function dedupeName(desired: string, taken: Iterable<string>): string {
  const used = taken instanceof Set ? taken : new Set(taken);
  if (!used.has(desired)) return desired;

  for (let i = 2; ; i++) {
    const suffix = `-${i}`;
    const maxBase = maxNameLength - suffix.length;
    const base = desired.slice(0, Math.min(desired.length, maxBase)).replace(/-+$/g, "");
    const candidate = `${base}${suffix}`;
    if (!used.has(candidate)) return candidate;
  }
}
