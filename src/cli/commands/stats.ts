/** `skillmesh stats` — show where skillmesh lives and a summary of the cached/installed skills. */

import { defineCommand } from "citty";
import * as p from "@clack/prompts";
import { pkg } from "../../constants";
import { collectStats } from "../../stats/stats";

/** Render a byte count as a short human-readable size (e.g. "12.3 MB"). */
function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(1)} ${units[unit]}`;
}

export const statsCommand = defineCommand({
  meta: {
    name: "stats",
    description: "Show the skillmesh home path and a summary of cached and installed skills",
  },
  async run() {
    const stats = await collectStats();

    p.intro(`skillmesh stats (v${pkg.version})`);

    p.note(
      [
        `home:     ${stats.home}`,
        `projects: ${stats.projectsTracked} tracked`,
        `plugins:  ${stats.plugins.total} installed, ${stats.plugins.enabled} enabled`,
      ].join("\n"),
      "Location",
    );

    const sources = Object.entries(stats.store.bySource)
      .sort((a, b) => b[1] - a[1])
      .map(([type, count]) => `${type} ${count}`)
      .join(", ");
    p.note(
      [
        `cached skills: ${stats.store.names} (${stats.store.versions} version(s))`,
        `on disk:       ${formatBytes(stats.store.sizeBytes)}`,
        `by source:     ${sources || "—"}`,
      ].join("\n"),
      "Store",
    );

    const a = stats.active;
    if (!a.initialized) {
      p.note(`${a.path}\n(not initialized — run 'skillmesh init')`, "Active project");
    } else {
      p.note(
        [
          `path:    ${a.path}`,
          `skills:  ${a.total} (${a.managed} managed, ${a.local} local)`,
          `health:  ${a.ok} ok, ${a.missing} missing, ${a.broken} broken`,
        ].join("\n"),
        "Active project",
      );
    }

    p.outro(stats.active.healthy ? "Healthy." : "Run 'skillmesh sync' to fix missing/broken skills.");
  },
});
