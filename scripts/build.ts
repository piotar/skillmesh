/**
 * Build skillmesh into Node-runnable bundles under dist/: the CLI (dist/index.js) and the MCP server
 * (dist/mcp.js). Run with Bun (the dev runtime); the output targets Node so `npm i -g` works on
 * machines without Bun, while Bun can still run the bundles too.
 */

import { chmod, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

const root = join(import.meta.dir, "..");
const outdir = join(root, "dist");
const nodeShebang = "#!/usr/bin/env node\n";

/** The bundles to emit: entry → output file name in dist/. */
const targets = [
  { entry: "src/cli/index.ts", out: "index.js" },
  { entry: "src/mcp/index.ts", out: "mcp.js" },
];

await rm(outdir, { recursive: true, force: true });

// Both entries are named `index.ts`, so they share a basename; build each separately with an explicit
// output name (`naming`) to avoid a collision in dist/.
for (const { entry, out } of targets) {
  const result = await Bun.build({
    entrypoints: [join(root, entry)],
    outdir,
    target: "node",
    naming: out,
  });

  if (!result.success) {
    for (const log of result.logs) console.error(log);
    process.exit(1);
  }

  // Bun keeps each entry's `#!/usr/bin/env bun` shebang; rewrite it to Node and make it executable.
  const outfile = join(outdir, out);
  const built = await readFile(outfile, "utf8");
  const body = built.startsWith("#!") ? built.slice(built.indexOf("\n") + 1) : built;
  await writeFile(outfile, nodeShebang + body);
  await chmod(outfile, 0o755);
  console.log(`Built ${outfile}`);
}
