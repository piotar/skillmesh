import { describe, expect, test } from "bun:test";
import {
  isValidName,
  validateDescription,
  validateFrontmatter,
  validateName,
  validateNameMatchesDir,
} from "./validate";

describe("validateName", () => {
  test("accepts spec-compliant names", () => {
    for (const name of ["pdf-processing", "data-analysis", "code-review", "a", "skill-2"]) {
      expect(validateName(name)).toEqual([]);
    }
  });

  test("rejects uppercase, leading/trailing and double hyphens", () => {
    expect(validateName("PDF-Processing").length).toBeGreaterThan(0);
    expect(validateName("-pdf").length).toBeGreaterThan(0);
    expect(validateName("pdf-").length).toBeGreaterThan(0);
    expect(validateName("pdf--processing").length).toBeGreaterThan(0);
  });

  test("rejects empty and over-length names", () => {
    expect(validateName("").length).toBeGreaterThan(0);
    expect(validateName("a".repeat(65)).length).toBeGreaterThan(0);
    expect(validateName("a".repeat(64))).toEqual([]);
  });
});

describe("validateDescription", () => {
  test("requires non-empty within 1024 chars", () => {
    expect(validateDescription("Extract PDFs")).toEqual([]);
    expect(validateDescription("   ").length).toBeGreaterThan(0);
    expect(validateDescription("x".repeat(1025)).length).toBeGreaterThan(0);
  });
});

describe("validateFrontmatter", () => {
  test("collects errors across fields", () => {
    const errors = validateFrontmatter({ name: "Bad Name", description: "" });
    expect(errors.length).toBe(2);
  });

  test("flags over-length compatibility", () => {
    const errors = validateFrontmatter({
      name: "ok",
      description: "fine",
      compatibility: "x".repeat(501),
    });
    expect(errors.length).toBe(1);
  });
});

describe("validateNameMatchesDir", () => {
  test("passes when equal, fails otherwise", () => {
    expect(validateNameMatchesDir("foo", "foo")).toEqual([]);
    expect(validateNameMatchesDir("foo", "bar").length).toBe(1);
  });
});

describe("isValidName", () => {
  test("mirrors validateName", () => {
    expect(isValidName("good-name")).toBe(true);
    expect(isValidName("Bad")).toBe(false);
  });
});
