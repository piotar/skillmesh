#!/usr/bin/env bun
/** skillmesh CLI entry point — wires domain commands into the citty command tree. */

import { defineCommand, runCommand, runMain, showUsage } from "citty";
import * as p from "@clack/prompts";
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

/** Print a failure as a clean one-line message (full stack only under SKILLMESH_DEBUG). */
function printError(err: unknown): void {
  if (process.env.SKILLMESH_DEBUG && err instanceof Error) {
    console.error(err.stack ?? err.message);
  } else {
    p.log.error(err instanceof Error ? err.message : String(err));
  }
}

async function run(): Promise<void> {
  const argv = process.argv.slice(2);
  const wantsUsage = argv.some((a) => ["--help", "-h", "--version", "-v"].includes(a));

  // The startup check may auto-upgrade and replace this process before the command runs; otherwise
  // it hands back a notice to show afterwards (only after a clean run).
  const { notice } = selfManages(argv) ? await startupSelfManage() : {};
  // Register enabled plugins' source adapters/importers before dispatch so commands like add/sync/
  // update/import can use them. Best-effort: a broken plugin warns and is skipped, never throwing.
  await loadEnabledPlugins();

  // citty's runMain prints a full stack trace for any failure; route normal dispatch through
  // runCommand so expected errors (empty cache, no TTY, missing skill, …) surface as a clean
  // one-liner. Delegate only the builtin --help/--version banners to runMain.
  if (wantsUsage) {
    await runMain(main, { rawArgs: argv });
  } else {
    try {
      await runCommand(main, { rawArgs: argv });
    } catch (err) {
      // CLIError (unknown/no command, bad args) reads better alongside the usage banner.
      if (err instanceof Error && err.name === "CLIError") await showUsage(main);
      printError(err);
      process.exit(1);
    }
  }

  if (notice) printNotice(notice);
}

void run().catch((err: unknown) => {
  printError(err);
  process.exit(1);
});
