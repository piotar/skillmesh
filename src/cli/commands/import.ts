/** `skillmesh import` — discover foreign project manifests via enabled plugin importers and add them. */

import { defineCommand } from "citty";
import * as p from "@clack/prompts";
import { resolveActiveProject } from "../../config/global";
import { importManifests } from "../../registry/registry";
import { interactiveResolveName } from "../prompts";
import { parseMode } from "../sourceArgs";

export const importCommand = defineCommand({
  meta: {
    name: "import",
    description: "Import skills from foreign manifests detected by enabled plugins",
  },
  args: {
    mode: { type: "string", description: "Install mode: 'link' (default) or 'copy'" },
    local: { type: "boolean", description: "Keep imported skills local-only" },
  },
  async run({ args }) {
    const projectPath = await resolveActiveProject();
    const mode = parseMode(args.mode);

    p.intro("skillmesh import");
    const result = await importManifests({
      projectPath,
      ...(mode ? { mode } : {}),
      ...(args.local ? { scope: "local" as const } : {}),
      resolveName: interactiveResolveName,
    });

    if (result.detected.length === 0) {
      p.outro("No foreign manifests detected (is a manifest-importer plugin enabled?).");
      return;
    }
    for (const d of result.detected) {
      p.log.info(`${d.importer}: ${d.sources.length} source(s)`);
    }
    for (const added of result.applied) p.log.success(`Added '${added.name}' (${added.mode})`);
    for (const skip of result.skipped) p.log.warn(`Skipped: ${skip.reason}`);
    p.outro(`Imported ${result.applied.length}, skipped ${result.skipped.length}.`);
  },
});
