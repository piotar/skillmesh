/** Start the skillmesh MCP server on the stdio transport. Shared by the `skillmesh-mcp` bin and the
 * `skillmesh mcp` subcommand. Returns once connected; the open stdin keeps the process alive. */

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { buildServer } from "./server";

/** Build the server and serve it over stdio (stdout stays the clean JSON-RPC channel). */
export async function serveStdio(home?: string): Promise<void> {
  const server = buildServer(home);
  await server.connect(new StdioServerTransport());
}
