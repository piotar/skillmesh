/** `skillmesh upgrade` (alias `self-update`) — check npm for a newer skillmesh and replace the global install. */

import { defineCommand } from "citty";
import * as p from "@clack/prompts";
import {
  checkForUpgrade,
  detectPackageManager,
  installLatest,
  upgradeCommandLine,
} from "../../upgrade/upgrade";

export const upgradeCommand = defineCommand({
  meta: { name: "upgrade", description: "Upgrade skillmesh itself to the latest npm release" },
  args: {
    check: {
      type: "boolean",
      description: "Only report whether a newer version exists; don't install",
      default: false,
    },
    yes: {
      type: "boolean",
      alias: "y",
      description: "Install without the confirmation prompt",
      default: false,
    },
  },
  async run({ args }) {
    p.intro("skillmesh upgrade");

    const spinner = p.spinner();
    spinner.start("Checking npm for the latest version…");
    let upgrade;
    try {
      upgrade = await checkForUpgrade();
    } catch (err) {
      spinner.stop("Could not reach the npm registry");
      throw err;
    }

    if (!upgrade.hasUpdate) {
      spinner.stop(`Already on the latest version (${upgrade.current}).`);
      p.outro("Up to date.");
      return;
    }

    spinner.stop(`Update available: ${upgrade.current} → ${upgrade.latest}`);

    const pm = detectPackageManager();

    if (args.check) {
      p.outro(`Run 'skillmesh upgrade' (or '${upgradeCommandLine(pm)}') to install it.`);
      return;
    }

    if (!args.yes) {
      const confirmed = await p.confirm({
        message: `Install skillmesh ${upgrade.latest} with ${pm}?`,
      });
      if (p.isCancel(confirmed) || !confirmed) {
        p.cancel("Upgrade cancelled.");
        return;
      }
    }

    spinner.start(`Installing skillmesh ${upgrade.latest} with ${pm}…`);
    try {
      await installLatest(pm);
      spinner.stop(`Upgraded to ${upgrade.latest}.`);
    } catch (err) {
      spinner.stop("Upgrade failed");
      throw err;
    }
    p.outro("Done.");
  },
});
