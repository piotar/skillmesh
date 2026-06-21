/**
 * Parse and minimally edit SKILL.md documents.
 * Reading uses the `yaml` parser (works on both Node and Bun); the single write case
 * (renaming `name`) is done surgically to avoid re-serializing — preserving formatting
 * and comments.
 */

import { parse as parseYaml } from "yaml";
import type { SkillFrontmatter } from "../types";

/** A parsed SKILL.md split into typed frontmatter and its markdown body. */
export type ParsedSkill = {
  frontmatter: SkillFrontmatter;
  body: string;
};

/** Matches a leading YAML frontmatter block delimited by `---` lines. */
const frontmatterRe = /^---\r?\n([\s\S]*?)\r?\n---[ \t]*\r?\n?([\s\S]*)$/;

/** Split a SKILL.md document into its raw YAML frontmatter and markdown body, or null if absent. */
export function splitFrontmatter(content: string): { yaml: string; body: string } | null {
  const match = content.match(frontmatterRe);
  if (!match) return null;
  return { yaml: match[1] ?? "", body: match[2] ?? "" };
}

/** Narrow an unknown value to a string, or undefined. */
function asString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

/** Coerce a raw YAML mapping into the typed SkillFrontmatter, validating required fields exist. */
function toFrontmatter(raw: Record<string, unknown>): SkillFrontmatter {
  const name = asString(raw.name);
  const description = asString(raw.description);
  if (name === undefined) throw new Error("SKILL.md frontmatter is missing required field 'name'");
  if (description === undefined) {
    throw new Error("SKILL.md frontmatter is missing required field 'description'");
  }

  const fm: SkillFrontmatter = { name, description };

  const license = asString(raw.license);
  if (license !== undefined) fm.license = license;

  const compatibility = asString(raw.compatibility);
  if (compatibility !== undefined) fm.compatibility = compatibility;

  const allowedTools = asString(raw["allowed-tools"]);
  if (allowedTools !== undefined) fm.allowedTools = allowedTools;

  if (raw.metadata && typeof raw.metadata === "object" && !Array.isArray(raw.metadata)) {
    const metadata: Record<string, string> = {};
    for (const [key, value] of Object.entries(raw.metadata as Record<string, unknown>)) {
      metadata[key] = String(value);
    }
    fm.metadata = metadata;
  }

  return fm;
}

/** Parse a full SKILL.md document into typed frontmatter and body. Throws on missing/invalid frontmatter. */
export function parseSkillMd(content: string): ParsedSkill {
  const split = splitFrontmatter(content);
  if (!split) throw new Error("SKILL.md is missing YAML frontmatter delimited by '---'");

  const raw: unknown = parseYaml(split.yaml);
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("SKILL.md frontmatter must be a YAML mapping");
  }

  return { frontmatter: toFrontmatter(raw as Record<string, unknown>), body: split.body };
}

/**
 * Replace the value of the `name:` field in a SKILL.md document, leaving everything else untouched.
 * Used to keep `name` in sync with the directory after a conflict-driven rename.
 */
export function setFrontmatterName(content: string, newName: string): string {
  const split = splitFrontmatter(content);
  if (!split) throw new Error("SKILL.md is missing YAML frontmatter delimited by '---'");
  if (!/^[ \t]*name[ \t]*:/m.test(split.yaml)) {
    throw new Error("SKILL.md frontmatter has no 'name' field to update");
  }

  const newYaml = split.yaml.replace(/^([ \t]*name[ \t]*:).*$/m, `$1 ${newName}`);
  return content.replace(split.yaml, newYaml);
}
