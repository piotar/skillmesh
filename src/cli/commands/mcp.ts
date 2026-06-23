/**
 * `skillmesh mcp` — run the read-only MCP skill-discovery server over stdio.
 *
 * Equivalent to the standalone `skillmesh-mcp` binary, for clients that prefer a subcommand. stdout
 * is the JSON-RPC channel: this command writes nothing to it, and the CLI's startup self-management is
 * skipped for `mcp` (see `selfManages` in cli/index.ts) so an auto-upgrade re-exec can't disrupt a
 * long-lived server.
 */

import { defineCommand } from "citty";
import { serveStdio } from "../../mcp/stdio";

export const mcpCommand = defineCommand({
  meta: {
    name: "mcp",
    description: "Run the read-only MCP skill-discovery server (stdio transport)",
  },
  async run() {
    await serveStdio();
    // Connected: the server serves requests until the client disconnects (open stdin keeps us alive).
  },
});
