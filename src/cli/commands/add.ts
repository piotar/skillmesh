/** `skillmesh add <source>` — fetch a skill from any source and install it into the active project. */

import { defineCommand } from "citty";
import * as p from "@clack/prompts";
import { resolveActiveProject } from "../../config/global";
import { addSkill, addStoredSkill } from "../../registry/registry";
import { parseSource } from "../../sources/resolve";
import { pickCachedSkills } from "../cachePicker";
import { interactiveResolveName } from "../prompts";
import { parseMode, withOverrides } from "../sourceArgs";

export const addCommand = defineCommand({
  meta: { name: "add", description: "Add a skill from git, npm, GitHub, a tarball or a local path" },
  args: {
    source: {
      type: "positional",
      required: false,
      description: "Source: path, git URL, owner/repo, npm:pkg, tarball URL (omit to pick from cache)",
    },
    ref: { type: "string", description: "Git/GitHub ref (branch, tag or commit)" },
    path: { type: "string", description: "Subdirectory within the source that holds the skill" },
    mode: { type: "string", description: "Install mode: 'link' (default) or 'copy'" },
    local: {
      type: "boolean",
      description: "Keep this skill local-only (do not add it to the committed project lock)",
    },
  },
  async run({ args }) {
    const projectPath = await resolveActiveProject();
    const mode = parseMode(args.mode);

    p.intro("skillmesh add");

    // No source given: pick one or more already-cached skills and install them from the store.
    if (!args.source) {
      const picks = await pickCachedSkills({ multiple: true });
      let added = 0;
      for (const pick of picks) {
        try {
          const result = await addStoredSkill({
            projectPath,
            entry: pick,
            ...(mode ? { mode } : {}),
            ...(args.local ? { scope: "local" as const } : {}),
            resolveName: interactiveResolveName,
          });
          added += 1;
          const renamed = result.renamedFrom ? ` — renamed from '${result.renamedFrom}'` : "";
          p.log.success(`Added '${result.name}' (${result.mode})${renamed}`);
        } catch (err) {
          p.log.warn(`Skipped '${pick.name}': ${(err as Error).message}`);
        }
      }
      p.outro(`Added ${added} of ${picks.length} from cache.`);
      return;
    }

    const source = withOverrides(parseSource(args.source), args.ref, args.path);
    const spinner = p.spinner();
    spinner.start(`Adding ${args.source}…`);
    try {
      const result = await addSkill({
        projectPath,
        source,
        ...(mode ? { mode } : {}),
        ...(args.local ? { scope: "local" as const } : {}),
        resolveName: interactiveResolveName,
      });
      spinner.stop(`Added '${result.name}' (${result.mode})`);
      if (result.renamedFrom) p.log.info(`Renamed from '${result.renamedFrom}' to match the standard.`);
      p.outro(`Done. Version ${result.version.slice(0, 12)}`);
    } catch (err) {
      spinner.stop("Failed");
      throw err;
    }
  },
});
