import { describe, expect, test } from "bun:test";
import { parseNpmrc, registryFromConfig } from "./registry";

describe("parseNpmrc", () => {
  test("parses key=value lines and skips blanks and comments", () => {
    const config = parseNpmrc(
      ["# a comment", "; another", "", "registry=https://npm.corp/", "  //npm.corp/:_authToken=secret  "].join(
        "\n",
      ),
    );
    expect(config.get("registry")).toBe("https://npm.corp/");
    expect(config.get("//npm.corp/:_authToken")).toBe("secret");
  });

  test("strips surrounding quotes from values", () => {
    expect(parseNpmrc('registry="https://npm.corp/"').get("registry")).toBe("https://npm.corp/");
  });
});

describe("registryFromConfig", () => {
  test("defaults to the public registry", () => {
    expect(registryFromConfig(new Map(), {})).toEqual({ url: "https://registry.npmjs.org" });
  });

  test("uses the .npmrc registry and trims a trailing slash", () => {
    const config = new Map([["registry", "https://npm.corp/"]]);
    expect(registryFromConfig(config, {})).toEqual({ url: "https://npm.corp" });
  });

  test("env npm_config_registry overrides the file setting", () => {
    const config = new Map([["registry", "https://npm.corp/"]]);
    const out = registryFromConfig(config, { npm_config_registry: "https://other/" });
    expect(out.url).toBe("https://other");
  });

  test("attaches a matching auth token and expands ${VAR}", () => {
    const config = new Map([
      ["registry", "https://npm.corp/"],
      ["//npm.corp/:_authToken", "${CORP_TOKEN}"],
    ]);
    const out = registryFromConfig(config, { CORP_TOKEN: "t0ken" });
    expect(out).toEqual({ url: "https://npm.corp", token: "t0ken" });
  });

  test("ignores a token scoped to a different host", () => {
    const config = new Map([
      ["registry", "https://npm.corp/"],
      ["//other.host/:_authToken", "nope"],
    ]);
    expect(registryFromConfig(config, {})).toEqual({ url: "https://npm.corp" });
  });
});
