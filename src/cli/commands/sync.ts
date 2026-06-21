/** `skillmesh sync` — install any skills declared in the lockfile that are missing locally. */

import { defineCommand } from "citty";
import * as p from "@clack/prompts";
import { resolveActiveProject } from "../../config/global";
import { syncProject } from "../../registry/registry";

export const syncCommand = defineCommand({
  meta: {
    name: "sync",
    description: "Install skills from the lockfile that are missing in the project (e.g. after cloning)",
  },
  async run() {
    const projectPath = await resolveActiveProject();
    p.intro("skillmesh sync");
    const spinner = p.spinner();
    spinner.start("Syncing skills from the lockfile…");
    try {
      const results = await syncProject({ projectPath });
      const imported = results.filter((r) => r.action === "imported");
      const installed = results.filter((r) => r.action === "installed");
      const parts: string[] = [];
      if (imported.length > 0) {
        parts.push(`Imported ${imported.length} skill(s): ${imported.map((r) => r.name).join(", ")}`);
      }
      if (installed.length > 0) {
        parts.push(`Installed ${installed.length} skill(s): ${installed.map((r) => r.name).join(", ")}`);
      }
      spinner.stop(parts.length > 0 ? parts.join("; ") : "Everything already in sync");
      p.outro("Done.");
    } catch (err) {
      spinner.stop("Failed");
      throw err;
    }
  },
});
