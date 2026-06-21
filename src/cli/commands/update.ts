/** `skillmesh update [name]` — re-fetch managed skills from their sources. Updates all when no name is given. */

import { defineCommand } from "citty";
import * as p from "@clack/prompts";
import { resolveActiveProject } from "../../config/global";
import { readEffectiveLockfile } from "../../config/project";
import { updateSkill } from "../../registry/registry";

export const updateCommand = defineCommand({
  meta: { name: "update", description: "Update managed skills from their recorded sources" },
  args: {
    name: { type: "positional", required: false, description: "Skill to update (default: all)" },
  },
  async run({ args }) {
    const projectPath = await resolveActiveProject();
    const names = args.name
      ? [args.name]
      : (await readEffectiveLockfile(projectPath)).skills.map((s) => s.name);

    if (names.length === 0) {
      p.intro("skillmesh update");
      p.outro("No managed skills to update.");
      return;
    }

    p.intro("skillmesh update");
    const spinner = p.spinner();
    for (const name of names) {
      spinner.start(`Updating ${name}…`);
      try {
        const result = await updateSkill({ projectPath, name });
        spinner.stop(
          result.changed
            ? `Updated '${name}' → ${result.to.slice(0, 12)}`
            : `'${name}' already up to date`,
        );
      } catch (err) {
        spinner.stop(`Failed to update '${name}'`);
        throw err;
      }
    }
    p.outro("Done.");
  },
});
