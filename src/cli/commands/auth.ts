/** `skillmesh auth …` — manage per-host credentials for private sources (git over HTTPS, tarballs). */

import { defineCommand } from "citty";
import * as p from "@clack/prompts";
import {
  type AuthScheme,
  type HostAuth,
  readAuthConfig,
  writeAuthConfig,
} from "../../config/auth";

/** Mask a token for display, revealing only the last few characters. */
function maskToken(token: string): string {
  if (token.startsWith("${")) return token; // an env reference is not a secret; show it as-is
  const tail = token.slice(-4);
  return token.length <= 4 ? "••••" : `••••${tail}`;
}

/** Coerce a raw scheme string into a valid AuthScheme, throwing on anything else. */
function parseScheme(value: string | undefined): AuthScheme | undefined {
  if (value === undefined) return undefined;
  if (value === "basic" || value === "bearer" || value === "private-token") return value;
  throw new Error(`Invalid --scheme '${value}'. Expected 'basic', 'bearer' or 'private-token'.`);
}

const listSub = defineCommand({
  meta: { name: "list", description: "List configured hosts (tokens are masked)" },
  async run() {
    const config = await readAuthConfig();
    const hosts = Object.entries(config.hosts);
    p.intro("skillmesh auth list");
    if (hosts.length === 0) {
      p.outro("No credentials configured. Add one with 'skillmesh auth add <host>'.");
      return;
    }
    const body = hosts
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([host, auth]) => `- ${host}  [${auth.scheme ?? "basic"}]  ${maskToken(auth.token)}`)
      .join("\n");
    p.note(body, "hosts");
    p.outro(`${hosts.length} host(s) configured.`);
  },
});

const addSub = defineCommand({
  meta: { name: "add", description: "Add or update credentials for a host" },
  args: {
    host: { type: "positional", required: true, description: "Host, e.g. gitlab.firma.pl" },
    token: { type: "string", description: "Token (prompted securely if omitted; use ${ENV} to read from env)" },
    scheme: { type: "string", description: "Auth scheme: 'basic' (default), 'bearer' or 'private-token'" },
    username: { type: "string", description: "Username for 'basic' scheme (default 'oauth2')" },
  },
  async run({ args }) {
    p.intro("skillmesh auth add");
    const scheme = parseScheme(args.scheme);

    let token = args.token;
    if (!token) {
      const entered = await p.password({
        message: `Token for ${args.host}`,
        validate: (v) => (!v || v.length === 0 ? "Token must not be empty" : undefined),
      });
      if (p.isCancel(entered)) {
        p.cancel("Aborted.");
        return;
      }
      token = entered;
    }

    const auth: HostAuth = { token };
    if (scheme) auth.scheme = scheme;
    if (args.username) auth.username = args.username;

    const config = await readAuthConfig();
    config.hosts[args.host.toLowerCase()] = auth;
    await writeAuthConfig(config);
    p.outro(`Saved credentials for ${args.host}.`);
  },
});

const removeSub = defineCommand({
  meta: { name: "remove", description: "Remove credentials for a host" },
  args: {
    host: { type: "positional", required: true, description: "Host to remove" },
  },
  async run({ args }) {
    p.intro("skillmesh auth remove");
    const config = await readAuthConfig();
    const key = args.host.toLowerCase();
    if (!(key in config.hosts)) {
      p.outro(`No credentials configured for ${args.host}.`);
      return;
    }
    delete config.hosts[key];
    await writeAuthConfig(config);
    p.outro(`Removed credentials for ${args.host}.`);
  },
});

export const authCommand = defineCommand({
  meta: { name: "auth", description: "Manage per-host credentials for private sources" },
  subCommands: { list: listSub, add: addSub, remove: removeSub },
});
