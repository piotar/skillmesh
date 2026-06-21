/** Validate skills against the agentskills.io specification. */

import type { SkillFrontmatter } from "../types";

/** A spec-compliant name: lowercase a-z/0-9 groups joined by single hyphens. */
const nameRe = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Validate a skill name against the spec. Returns human-readable errors (empty = valid). */
export function validateName(name: string): string[] {
  const errors: string[] = [];
  if (name.length < 1 || name.length > 64) {
    errors.push("name must be between 1 and 64 characters");
  }
  if (!nameRe.test(name)) {
    errors.push(
      "name may only contain lowercase letters, digits and single hyphens, and must not start or end with a hyphen",
    );
  }
  return errors;
}

/** Validate a skill description against the spec. Returns human-readable errors (empty = valid). */
export function validateDescription(description: string): string[] {
  const errors: string[] = [];
  if (description.trim().length < 1) errors.push("description must not be empty");
  if (description.length > 1024) errors.push("description must be at most 1024 characters");
  return errors;
}

/** Validate a parsed frontmatter object. Returns all errors found across fields. */
export function validateFrontmatter(fm: SkillFrontmatter): string[] {
  const errors = [...validateName(fm.name), ...validateDescription(fm.description)];
  if (fm.compatibility !== undefined && fm.compatibility.length > 500) {
    errors.push("compatibility must be at most 500 characters");
  }
  return errors;
}

/** Validate that a skill's `name` matches its directory name, as required by the spec. */
export function validateNameMatchesDir(name: string, dirName: string): string[] {
  return name === dirName ? [] : [`name '${name}' must match the directory name '${dirName}'`];
}

/** Whether a name is spec-compliant. */
export function isValidName(name: string): boolean {
  return validateName(name).length === 0;
}
