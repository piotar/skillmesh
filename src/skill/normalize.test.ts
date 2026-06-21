import { describe, expect, test } from "bun:test";
import { isValidName } from "./validate";
import { dedupeName, normalizeName } from "./normalize";

describe("normalizeName", () => {
  test("kebab-cases arbitrary input", () => {
    expect(normalizeName("PDF Processing")).toBe("pdf-processing");
    expect(normalizeName("My_Cool Skill!!")).toBe("my-cool-skill");
    expect(normalizeName("  --Trim--  ")).toBe("trim");
    expect(normalizeName("multiple   spaces")).toBe("multiple-spaces");
  });

  test("always produces a spec-compliant name", () => {
    for (const input of ["Über Skill", "a/b/c", "...", "@scope/pkg", "X".repeat(100)]) {
      expect(isValidName(normalizeName(input))).toBe(true);
    }
  });

  test("falls back when nothing usable remains", () => {
    expect(normalizeName("!!!")).toBe("skill");
    expect(normalizeName("")).toBe("skill");
  });

  test("truncates to 64 chars without trailing hyphen", () => {
    const out = normalizeName("a".repeat(70));
    expect(out.length).toBe(64);
    expect(out.endsWith("-")).toBe(false);
  });
});

describe("dedupeName", () => {
  test("returns the name unchanged when free", () => {
    expect(dedupeName("foo", [])).toBe("foo");
    expect(dedupeName("foo", ["bar"])).toBe("foo");
  });

  test("appends an incrementing suffix on conflict", () => {
    expect(dedupeName("foo", ["foo"])).toBe("foo-2");
    expect(dedupeName("foo", ["foo", "foo-2"])).toBe("foo-3");
    expect(dedupeName("foo", new Set(["foo", "foo-2", "foo-3"]))).toBe("foo-4");
  });

  test("stays spec-compliant and within length when truncating", () => {
    const long = "a".repeat(64);
    const out = dedupeName(long, [long]);
    expect(out.length).toBeLessThanOrEqual(64);
    expect(isValidName(out)).toBe(true);
    expect(out.endsWith("-2")).toBe(true);
  });
});
