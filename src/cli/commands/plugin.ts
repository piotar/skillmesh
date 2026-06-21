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
import { pickPlugins } from "../pickers";
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
  meta: { name: "enable", description: "Enable installed plugins (omit name to pick)" },
  args: { name: { type: "positional", required: false, description: "Plugin name (omit to pick)" } },
  async run({ args }) {
    const names = args.name ? [args.name] : await pickPlugins("Select plugins to enable", "disabled");
    for (const name of names) {
      await enablePlugin(name);
      p.log.success(`Enabled '${name}'`);
    }
  },
});

const disableSub = defineCommand({
  meta: { name: "disable", description: "Disable plugins without removing them (omit name to pick)" },
  args: { name: { type: "positional", required: false, description: "Plugin name (omit to pick)" } },
  async run({ args }) {
    const names = args.name ? [args.name] : await pickPlugins("Select plugins to disable", "enabled");
    for (const name of names) {
      await disablePlugin(name);
      p.log.success(`Disabled '${name}'`);
    }
  },
});

const removeSub = defineCommand({
  meta: { name: "remove", description: "Remove plugins from the ecosystem (omit name to pick)" },
  args: { name: { type: "positional", required: false, description: "Plugin name (omit to pick)" } },
  async run({ args }) {
    const names = args.name ? [args.name] : await pickPlugins("Select plugins to remove");
    for (const name of names) {
      await removePlugin(name);
      p.log.success(`Removed '${name}'`);
    }
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
