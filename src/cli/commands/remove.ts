/** `skillmesh remove [name]` — uninstall managed skills from the active project (omit name to pick). */

import { defineCommand } from "citty";
import * as p from "@clack/prompts";
import { resolveActiveProject } from "../../config/global";
import { removeSkill } from "../../registry/registry";
import { pickInstalledSkills } from "../pickers";

export const removeCommand = defineCommand({
  meta: { name: "remove", description: "Remove managed skills from the active project (omit name to pick)" },
  args: {
    name: { type: "positional", required: false, description: "Installed skill name (omit to pick interactively)" },
  },
  async run({ args }) {
    const projectPath = await resolveActiveProject();
    const names = args.name ? [args.name] : await pickInstalledSkills(projectPath);

    p.intro("skillmesh remove");
    for (const name of names) {
      await removeSkill({ projectPath, name });
      p.log.success(`Removed '${name}'`);
    }
    p.outro(`Removed ${names.length} skill(s).`);
  },
});
