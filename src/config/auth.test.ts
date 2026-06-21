import { afterAll, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  type AuthConfig,
  authHeader,
  headerForUrl,
  hostOf,
  lookupHostAuth,
  readAuthConfig,
  writeAuthConfig,
} from "./auth";

const tmpDirs: string[] = [];

/** Create a throwaway home directory tracked for cleanup. */
async function tmp(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "skillmesh-auth-"));
  tmpDirs.push(dir);
  return dir;
}

afterAll(async () => {
  await Promise.all(tmpDirs.map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("read/write", () => {
  test("returns an empty config when no file exists", async () => {
    const home = await tmp();
    expect(await readAuthConfig(home)).toEqual({ version: 1, hosts: {} });
  });

  test("round-trips the config", async () => {
    const home = await tmp();
    const config: AuthConfig = {
      version: 1,
      hosts: { "gitlab.firma.pl": { token: "glpat-x", scheme: "private-token" } },
    };
    await writeAuthConfig(config, home);
    expect(await readAuthConfig(home)).toEqual(config);
  });
});

describe("lookupHostAuth", () => {
  const config: AuthConfig = {
    version: 1,
    hosts: {
      "gitlab.firma.pl": { token: "raw-token" },
      "ci.firma.pl": { token: "${CI_TOKEN}" },
    },
  };

  test("matches case-insensitively and ignores the port", () => {
    expect(lookupHostAuth("GitLab.Firma.PL:443", config)?.token).toBe("raw-token");
  });

  test("returns undefined for an unknown host", () => {
    expect(lookupHostAuth("github.com", config)).toBeUndefined();
  });

  test("expands a ${ENV} token reference", () => {
    expect(lookupHostAuth("ci.firma.pl", config, { CI_TOKEN: "secret" })?.token).toBe("secret");
  });

  test("treats a ${ENV} that resolves empty as no credential", () => {
    expect(lookupHostAuth("ci.firma.pl", config, {})).toBeUndefined();
  });
});

describe("authHeader", () => {
  test("basic encodes username:token (default username oauth2)", () => {
    const header = authHeader({ token: "t" });
    expect(header.name).toBe("Authorization");
    expect(header.value).toBe(`Basic ${Buffer.from("oauth2:t").toString("base64")}`);
  });

  test("basic honors a custom username", () => {
    const header = authHeader({ token: "t", scheme: "basic", username: "x-access-token" });
    expect(header.value).toBe(`Basic ${Buffer.from("x-access-token:t").toString("base64")}`);
  });

  test("bearer", () => {
    expect(authHeader({ token: "t", scheme: "bearer" })).toEqual({
      name: "Authorization",
      value: "Bearer t",
    });
  });

  test("private-token", () => {
    expect(authHeader({ token: "t", scheme: "private-token" })).toEqual({
      name: "PRIVATE-TOKEN",
      value: "t",
    });
  });
});

describe("hostOf", () => {
  test("https URL", () => {
    expect(hostOf("https://gitlab.firma.pl/grupa/repo.git")).toBe("gitlab.firma.pl");
  });

  test("git@host:path SSH form", () => {
    expect(hostOf("git@gitlab.firma.pl:grupa/repo.git")).toBe("gitlab.firma.pl");
  });

  test("undefined for a local path", () => {
    expect(hostOf("/some/local/path")).toBeUndefined();
  });
});

describe("headerForUrl", () => {
  test("resolves the header for a configured host", async () => {
    const home = await tmp();
    await writeAuthConfig(
      { version: 1, hosts: { "gitlab.firma.pl": { token: "t", scheme: "bearer" } } },
      home,
    );
    expect(await headerForUrl("https://gitlab.firma.pl/g/r.git", home)).toEqual({
      name: "Authorization",
      value: "Bearer t",
    });
  });

  test("undefined when the host has no entry", async () => {
    const home = await tmp();
    expect(await headerForUrl("https://github.com/g/r.git", home)).toBeUndefined();
  });
});
