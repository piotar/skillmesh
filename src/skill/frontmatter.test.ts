import { describe, expect, test } from "bun:test";
import { parseSkillMd, setFrontmatterName, splitFrontmatter } from "./frontmatter";

const sample = `---
name: pdf-processing
description: Extract PDF text, fill forms, merge files.
license: Apache-2.0
metadata:
  author: example-org
  version: "1.0"
allowed-tools: Bash(git:*) Read
---
# PDF processing

Body content here.
`;

describe("splitFrontmatter", () => {
  test("separates frontmatter from body", () => {
    const split = splitFrontmatter(sample);
    expect(split).not.toBeNull();
    expect(split?.yaml).toContain("name: pdf-processing");
    expect(split?.body).toContain("# PDF processing");
  });

  test("returns null without frontmatter", () => {
    expect(splitFrontmatter("# just markdown")).toBeNull();
  });
});

describe("parseSkillMd", () => {
  test("parses required and optional fields", () => {
    const { frontmatter, body } = parseSkillMd(sample);
    expect(frontmatter.name).toBe("pdf-processing");
    expect(frontmatter.description).toContain("Extract PDF text");
    expect(frontmatter.license).toBe("Apache-2.0");
    expect(frontmatter.allowedTools).toBe("Bash(git:*) Read");
    expect(frontmatter.metadata).toEqual({ author: "example-org", version: "1.0" });
    expect(body).toContain("Body content here.");
  });

  test("throws on missing frontmatter", () => {
    expect(() => parseSkillMd("no frontmatter")).toThrow();
  });

  test("throws when required fields are missing", () => {
    expect(() => parseSkillMd("---\ndescription: only desc\n---\n")).toThrow(/name/);
    expect(() => parseSkillMd("---\nname: only-name\n---\n")).toThrow(/description/);
  });

  test("throws on invalid YAML", () => {
    expect(() => parseSkillMd("---\nname: : :\n  - broken\n---\n")).toThrow();
  });
});

describe("setFrontmatterName", () => {
  test("rewrites only the name field, preserving the rest", () => {
    const out = setFrontmatterName(sample, "pdf-processing-2");
    const { frontmatter, body } = parseSkillMd(out);
    expect(frontmatter.name).toBe("pdf-processing-2");
    expect(frontmatter.license).toBe("Apache-2.0");
    expect(body).toContain("Body content here.");
  });

  test("throws when there is no name field", () => {
    expect(() => setFrontmatterName("---\ndescription: d\n---\n", "x")).toThrow(/name/);
  });
});
