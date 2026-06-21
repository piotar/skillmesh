/** `skillmesh status` (alias `doctor`) — report install health and lockfile drift. */

import { defineCommand } from "citty";
import * as p from "@clack/prompts";
import { resolveActiveProject } from "../../config/global";
import { projectStatus } from "../../registry/registry";

export const statusCommand = defineCommand({
  meta: {
    name: "status",
    description: "Report install health: missing skills, broken links and lockfile drift",
  },
  async run() {
    const projectPath = await resolveActiveProject();
    const report = await projectStatus({ projectPath });

    p.intro("skillmesh status");

    const total =
      report.ok.length +
      report.missing.length +
      report.broken.length +
      report.untracked.length +
      report.local.length;
    if (total === 0) {
      p.outro("No skills in this project.");
      return;
    }

    if (report.ok.length > 0) p.log.success(`OK: ${report.ok.join(", ")}`);
    if (report.local.length > 0) p.log.info(`Project-local: ${report.local.join(", ")}`);
    if (report.missing.length > 0) {
      p.log.warn(`Missing (run 'skillmesh sync'): ${report.missing.join(", ")}`);
    }
    if (report.broken.length > 0) {
      p.log.error(`Broken links (run 'skillmesh sync'): ${report.broken.join(", ")}`);
    }
    if (report.untracked.length > 0) {
      p.log.warn(`Managed but not in any lockfile: ${report.untracked.join(", ")}`);
    }

    if (report.healthy) {
      p.outro("Healthy.");
    } else {
      p.outro("Problems found.");
      process.exitCode = 1;
    }
  },
});
