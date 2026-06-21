/** `skillmesh plugin …` — install, list, enable/disable and remove ecosystem-wide plugins. */

import { defineCommand } from "citty";
import * as p from "@clack/prompts";
import {
  disablePlugin,
  enablePlugin,
  installPlugin,
  listPlugins,
  removePlugin,
} from "../../plugin/manage";
import { parseSource } from "../../sources/resolve";
import { withOverrides } from "../sourceArgs";

const addSub = defineCommand({
  meta: { name: "add", description: "Install a plugin from any source (enabled by default)" },
  args: {
    source: { type: "positional", required: true, description: "Plugin source (same forms as 'add')" },
    ref: { type: "string", description: "Git/GitHub ref" },
    path: { type: "string", description: "Subdirectory within the source" },
  },
  async run({ args }) {
    const source = withOverrides(parseSource(args.source), args.ref, args.path);
    p.intro("skillmesh plugin add");
    const { installed, plugin } = await installPlugin(source);
    const provides = [
      plugin.sources?.length ? `${plugin.sources.length} source adapter(s)` : null,
      plugin.importers?.length ? `${plugin.importers.length} importer(s)` : null,
    ].filter(Boolean);
    p.log.success(`Installed '${installed.name}'@${installed.version} (enabled)`);
    p.outro(provides.length ? `Provides ${provides.join(", ")}.` : "No adapters or importers declared.");
  },
});

const listSub = defineCommand({
  meta: { name: "list", description: "List installed plugins" },
  async run() {
    const plugins = await listPlugins();
    p.intro("skillmesh plugin list");
    if (plugins.length === 0) {
      p.outro("No plugins installed.");
      return;
    }
    for (const plugin of plugins) {
      p.note(
        `version: ${plugin.version}\nstate:   ${plugin.enabled ? "enabled" : "disabled"}\nsource:  ${plugin.source.type}`,
        plugin.name,
      );
    }
    p.outro(`${plugins.length} plugin(s)`);
  },
});

const enableSub = defineCommand({
  meta: { name: "enable", description: "Enable an installed plugin" },
  args: { name: { type: "positional", required: true, description: "Plugin name" } },
  async run({ args }) {
    await enablePlugin(args.name);
    p.log.success(`Enabled '${args.name}'`);
  },
});

const disableSub = defineCommand({
  meta: { name: "disable", description: "Disable a plugin without removing it" },
  args: { name: { type: "positional", required: true, description: "Plugin name" } },
  async run({ args }) {
    await disablePlugin(args.name);
    p.log.success(`Disabled '${args.name}'`);
  },
});

const removeSub = defineCommand({
  meta: { name: "remove", description: "Remove a plugin from the ecosystem" },
  args: { name: { type: "positional", required: true, description: "Plugin name" } },
  async run({ args }) {
    await removePlugin(args.name);
    p.log.success(`Removed '${args.name}'`);
  },
});

export const pluginCommand = defineCommand({
  meta: { name: "plugin", description: "Manage plugins (source adapters and manifest importers)" },
  subCommands: {
    add: addSub,
    list: listSub,
    enable: enableSub,
    disable: disableSub,
    remove: removeSub,
  },
});
