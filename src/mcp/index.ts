#!/usr/bin/env node
/**
 * skillmesh MCP server entry point (stdio transport).
 *
 * stdout is the JSON-RPC channel and must stay clean — so, unlike the CLI, this entry never prints to
 * stdout (no banner, no auto-upgrade, no prompts). Diagnostics and fatal errors go to stderr.
 */

import { serveStdio } from "./stdio";

serveStdio().catch((err: unknown) => {
  console.error(err instanceof Error ? (err.stack ?? err.message) : String(err));
  process.exit(1);
});
