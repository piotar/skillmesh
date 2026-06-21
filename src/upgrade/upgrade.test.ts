import { describe, expect, test } from "bun:test";
import { detectPackageManager, isNewer, upgradeCommandLine } from "./upgrade";

describe("isNewer", () => {
  test("detects a higher patch, minor and major", () => {
    expect(isNewer("0.1.1", "0.1.0")).toBe(true);
    expect(isNewer("0.2.0", "0.1.9")).toBe(true);
    expect(isNewer("1.0.0", "0.9.9")).toBe(true);
  });

  test("equal versions are not newer", () => {
    expect(isNewer("0.1.0", "0.1.0")).toBe(false);
  });

  test("lower versions are not newer", () => {
    expect(isNewer("0.1.0", "0.1.1")).toBe(false);
    expect(isNewer("0.9.9", "1.0.0")).toBe(false);
  });

  test("tolerates a leading v and missing components", () => {
    expect(isNewer("v1.2.0", "1.1.0")).toBe(true);
    expect(isNewer("2", "1.9.9")).toBe(true);
  });

  test("ignores pre-release and build metadata in the core comparison", () => {
    expect(isNewer("1.0.0-beta.1", "1.0.0")).toBe(false);
    expect(isNewer("1.0.1+build.5", "1.0.0")).toBe(true);
  });
});

describe("detectPackageManager", () => {
  // Non-existent paths make realpathSync throw and the detector fall back to the raw path.
  test("recognizes each manager's global install location", () => {
    expect(detectPackageManager("/home/me/.bun/bin/skillmesh")).toBe("bun");
    expect(detectPackageManager("C:\\Users\\me\\.bun\\bin\\skillmesh.exe")).toBe("bun");
    expect(detectPackageManager("/home/me/.local/share/pnpm/skillmesh")).toBe("pnpm");
    expect(detectPackageManager("/home/me/.config/yarn/global/node_modules/skillmesh")).toBe("yarn");
    expect(detectPackageManager("/usr/local/lib/node_modules/skillmesh/dist/index.js")).toBe("npm");
  });
});

describe("upgradeCommandLine", () => {
  test("renders the global-install command for each manager (no .cmd/.exe suffix)", () => {
    expect(upgradeCommandLine("npm")).toBe("npm install -g skillmesh@latest");
    expect(upgradeCommandLine("bun")).toBe("bun add -g skillmesh@latest");
    expect(upgradeCommandLine("pnpm")).toBe("pnpm add -g skillmesh@latest");
    expect(upgradeCommandLine("yarn")).toBe("yarn global add skillmesh@latest");
  });
});
