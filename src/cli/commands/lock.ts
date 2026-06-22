/** `skillmesh lock` — export/import the committed project lockfile (skillmesh.lock.json). */

import { defineCommand } from "citty";
import * as p from "@clack/prompts";
import { resolveActiveProject } from "../../config/global";
import { exportLock, importLock } from "../../registry/registry";

const exportCommand = defineCommand({
  meta: {
    name: "export",
    description: "Write skillmesh.lock.json from the current managed skills (for committing)",
  },
  async run() {
    const projectPath = await resolveActiveProject();
    p.intro("skillmesh lock export");
    const count = await exportLock({ projectPath });
    p.outro(`Wrote skillmesh.lock.json (${count} skill(s)).`);
  },
});

const importCommand = defineCommand({
  meta: {
    name: "import",
    description: "Adopt a committed skillmesh.lock.json into local state and install its skills",
  },
  async run() {
    const projectPath = await resolveActiveProject();
    p.intro("skillmesh lock import");
    const spinner = p.spinner();
    spinner.start("Importing lockfile and installing…");
    try {
      const results = await importLock({ projectPath });
      const installed = results.filter((r) => r.action === "installed");
      spinner.stop(
        installed.length > 0
          ? `Installed ${installed.length} skill(s): ${installed.map((r) => r.name).join(", ")}`
          : "Lockfile adopted; everything already in sync",
      );
      p.outro("Done.");
    } catch (err) {
      spinner.stop("Failed");
      throw err;
    }
  },
});

export const lockCommand = defineCommand({
  meta: {
    name: "lock",
    description: "Export/import the committed project lockfile (skillmesh.lock.json)",
  },
  subCommands: {
    export: exportCommand,
    import: importCommand,
  },
});
