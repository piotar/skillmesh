/** Interactive CLI prompts that back the registry's injected callbacks. */

import * as p from "@clack/prompts";
import type { ResolveNameFn } from "../registry/registry";

/**
 * A name-conflict resolver that prompts the user for a replacement name.
 * Falls back to the proposed name when not attached to a TTY (e.g. in CI).
 */
export const interactiveResolveName: ResolveNameFn = async (proposed, ctx) => {
  if (!process.stdout.isTTY) return proposed;
  const answer = await p.text({
    message: `Name '${ctx.declared}' conflicts with an existing skill. Choose a name:`,
    initialValue: proposed,
  });
  if (p.isCancel(answer)) {
    p.cancel("Aborted.");
    process.exit(1);
  }
  return answer || proposed;
};
