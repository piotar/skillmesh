/**
 * The skillmesh MCP server: a thin, read-only wrapper over `discovery.ts` that lets an agent browse
 * the skill catalog (installed / cached / presets) and read a skill's SKILL.md before a human decides
 * to install it. No tool here fetches, installs or mutates anything.
 */

import { z } from "zod";
import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { pkg } from "../constants";
import {
  installHint,
  listAvailableSkills,
  listInstalledSkills,
  listPresetsInfo,
  readSkill,
} from "./discovery";

/** Render a value as pretty JSON for a tool's text content. */
function json(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

/** A tool result carrying a single JSON text block. */
function jsonResult(value: unknown): { content: { type: "text"; text: string }[] } {
  return { content: [{ type: "text", text: json(value) }] };
}

/** A tool error result with a plain message. */
function errorResult(message: string): {
  content: { type: "text"; text: string }[];
  isError: true;
} {
  return { content: [{ type: "text", text: message }], isError: true };
}

/**
 * Build the skillmesh MCP server with its read-only discovery tools and resources registered.
 * `home` overrides the skillmesh home (defaults to `~/.skillmesh`); used by tests.
 */
export function buildServer(home?: string): McpServer {
  const server = new McpServer(
    { name: pkg.name, version: pkg.version },
    {
      instructions:
        "Read-only discovery for skillmesh-managed AI agent skills. Browse installed skills, the " +
        "cached store (installable skills) and presets, and read a skill's SKILL.md. This server " +
        "never installs or changes anything; installs are done by a human via `skillmesh add`.",
    },
  );

  server.registerTool(
    "list_installed_skills",
    {
      title: "List installed skills",
      description: "List skills installed in the active project (managed and project-local).",
      inputSchema: {},
      annotations: { readOnlyHint: true },
    },
    async () => jsonResult(await listInstalledSkills(home)),
  );

  server.registerTool(
    "list_available_skills",
    {
      title: "List available (cached) skills",
      description:
        "List skills cached in the global store that a human can install, one per name (latest " +
        "version), optionally filtered by a substring of the name or description.",
      inputSchema: {
        query: z.string().optional().describe("Case-insensitive filter on name and description."),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ query }) =>
      jsonResult({ skills: await listAvailableSkills(query, home), hint: installHint }),
  );

  server.registerTool(
    "list_presets",
    {
      title: "List presets",
      description: "List presets (named sets of skill sources) and the origin of each source.",
      inputSchema: {},
      annotations: { readOnlyHint: true },
    },
    async () => jsonResult(await listPresetsInfo(home)),
  );

  server.registerTool(
    "read_skill",
    {
      title: "Read a skill's SKILL.md",
      description:
        "Read the full SKILL.md of a skill so you can inspect it before a human installs it. " +
        "Defaults to the cached store copy (latest version unless one is given), falling back to " +
        "the installed project copy.",
      inputSchema: {
        name: z.string().describe("The skill name (lowercase-kebab)."),
        version: z.string().optional().describe("Store version; defaults to the latest cached."),
        scope: z
          .enum(["store", "project"])
          .optional()
          .describe("Where to read from; defaults to 'store' with a fallback to 'project'."),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ name, version, scope }) => {
      const skill = await readSkill(
        { name, ...(version ? { version } : {}), ...(scope ? { scope } : {}) },
        home,
      );
      if (!skill) return errorResult(`No skill named '${name}' found in the store or the project.`);
      return jsonResult({ ...skill, hint: installHint });
    },
  );

  registerResources(server, home);
  return server;
}

/**
 * Expose each cached skill's SKILL.md as a read-only MCP resource (`skillmesh://store/<name>/SKILL.md`).
 * Complementary to the tools — some clients surface resources for the user to attach as context.
 */
function registerResources(server: McpServer, home?: string): void {
  server.registerResource(
    "store-skill",
    new ResourceTemplate("skillmesh://store/{name}/SKILL.md", {
      list: async () => {
        const skills = await listAvailableSkills(undefined, home);
        return {
          resources: skills.map((s) => ({
            uri: `skillmesh://store/${s.name}/SKILL.md`,
            name: s.name,
            description: s.description ?? `Cached skill ${s.name}`,
            mimeType: "text/markdown",
          })),
        };
      },
    }),
    { title: "Cached skill SKILL.md", mimeType: "text/markdown" },
    async (uri, { name }) => {
      const skillName = Array.isArray(name) ? name[0] : name;
      const skill = skillName ? await readSkill({ name: skillName }, home) : null;
      if (!skill) throw new Error(`No cached skill named '${String(name)}'.`);
      return {
        contents: [{ uri: uri.href, mimeType: "text/markdown", text: skill.content }],
      };
    },
  );
}
