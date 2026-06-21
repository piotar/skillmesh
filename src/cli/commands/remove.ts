/** `skillmesh remove <name>` — uninstall a managed skill from the active project. */

import { defineCommand } from "citty";
import * as p from "@clack/prompts";
import { resolveActiveProject } from "../../config/global";
import { removeSkill } from "../../registry/registry";

export const removeCommand = defineCommand({
  meta: { name: "remove", description: "Remove a managed skill from the active project" },
  args: {
    name: { type: "positional", required: true, description: "Installed skill name" },
  },
  async run({ args }) {
    const projectPath = await resolveActiveProject();
    p.intro("skillmesh remove");
    await removeSkill({ projectPath, name: args.name });
    p.outro(`Removed '${args.name}'`);
  },
});
