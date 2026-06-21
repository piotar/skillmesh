/** `skillmesh validate` — check installed skills against the agentskills.io standard. */

import { defineCommand } from "citty";
import * as p from "@clack/prompts";
import { resolveActiveProject } from "../../config/global";
import { validateProject } from "../../registry/registry";

export const validateCommand = defineCommand({
  meta: { name: "validate", description: "Validate installed skills against the agentskills.io standard" },
  async run() {
    const projectPath = await resolveActiveProject();
    const issues = await validateProject({ projectPath });

    p.intro("skillmesh validate");
    if (issues.length === 0) {
      p.outro("All skills are valid.");
      return;
    }

    for (const issue of issues) {
      p.log.error(`${issue.name}:\n  - ${issue.errors.join("\n  - ")}`);
    }
    p.outro(`${issues.length} skill(s) with problems.`);
    process.exitCode = 1;
  },
});
