/** `skillmesh list` — show skills in the active project (managed and project-local) with their status. */

import { defineCommand } from "citty";
import * as p from "@clack/prompts";
import { resolveActiveProject } from "../../config/global";
import { listSkills } from "../../registry/registry";
import type { SourceSpec } from "../../types";
import { describeSource } from "../describeSource";

/** Format an optional source spec into a short origin string (or a dash when absent). */
function describeOrigin(source?: SourceSpec): string {
  return source ? describeSource(source) : "—";
}

export const listCommand = defineCommand({
  meta: { name: "list", description: "List skills in the active project" },
  async run() {
    const projectPath = await resolveActiveProject();
    const skills = await listSkills({ projectPath });

    p.intro("skillmesh list");
    if (skills.length === 0) {
      p.outro("No skills installed.");
      return;
    }

    const lines = skills.map((s) => {
      const tags = [s.kind, s.status, s.mode].filter(Boolean).join(", ");
      return `${s.name}  (${tags})  ${describeOrigin(s.source)}`;
    });
    p.note(lines.join("\n"), `${skills.length} skill(s)`);
    p.outro("Done.");
  },
});
