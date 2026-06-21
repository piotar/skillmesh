#!/usr/bin/env bun
/** skillmesh CLI entry point — wires domain commands into the citty command tree. */

import { defineCommand, runMain } from "citty";
import { pkg } from "../constants";
import { addCommand } from "./commands/add";
import { authCommand } from "./commands/auth";
import { cacheCommand } from "./commands/cache";
import { importCommand } from "./commands/import";
import { initCommand } from "./commands/init";
import { listCommand } from "./commands/list";
import { pluginCommand } from "./commands/plugin";
import { presetCommand } from "./commands/preset";
import { removeCommand } from "./commands/remove";
import { statsCommand } from "./commands/stats";
import { statusCommand } from "./commands/status";
import { syncCommand } from "./commands/sync";
import { updateCommand } from "./commands/update";
import { upgradeCommand } from "./commands/upgrade";
import { validateCommand } from "./commands/validate";
import { loadEnabledPlugins } from "../plugin/load";
import { printNotice, startupSelfManage } from "../upgrade/startup";

const main = defineCommand({
  meta: {
    name: pkg.name,
    version: pkg.version,
    description: "Registry and manager for AI agent skills (agentskills.io standard).",
  },
  subCommands: {
    init: initCommand,
    add: addCommand,
    remove: removeCommand,
    update: updateCommand,
    sync: syncCommand,
    list: listCommand,
    cache: cacheCommand,
    store: cacheCommand,
    auth: authCommand,
    validate: validateCommand,
    status: statusCommand,
    doctor: statusCommand,
    stats: statsCommand,
    preset: presetCommand,
    plugin: pluginCommand,
    import: importCommand,
    upgrade: upgradeCommand,
    "self-update": upgradeCommand,
  },
});

/** Skip self-management during `upgrade`/`self-update` itself, and on the help/version banners. */
function selfManages(argv: string[]): boolean {
  if (argv.some((a) => ["--help", "-h", "--version", "-v"].includes(a))) return false;
  const sub = argv.find((a) => !a.startsWith("-"));
  return sub !== "upgrade" && sub !== "self-update";
}

async function run(): Promise<void> {
  const argv = process.argv.slice(2);

  // The startup check may auto-upgrade and replace this process before the command runs; otherwise
  // it hands back a notice to show afterwards. runMain resolves on success and process.exit(1)s on
  // error, so the notice only follows a clean run.
  const { notice } = selfManages(argv) ? await startupSelfManage() : {};
  // Register enabled plugins' source adapters/importers before dispatch so commands like add/sync/
  // update/import can use them. Best-effort: a broken plugin warns and is skipped, never throwing.
  await loadEnabledPlugins();
  await runMain(main);
  if (notice) printNotice(notice);
}

void run();
