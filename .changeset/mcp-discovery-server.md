---
"skillmesh": minor
---

Add a read-only MCP server (`skillmesh-mcp`) for skill discovery.

A new `skillmesh-mcp` binary (or the equivalent `skillmesh mcp` subcommand) exposes your skills to an
agent over the Model Context Protocol (stdio). It is strictly read-only — the agent can browse and
read skills but never fetches, installs or changes anything, so installs stay a deliberate human
action via `skillmesh add`.

Tools: `list_installed_skills` (active project), `list_available_skills` (the cached store, with an
optional `query` filter), `list_presets`, and `read_skill` (a skill's full `SKILL.md`, from the store
or the project). Each cached skill's `SKILL.md` is also offered as an MCP resource
(`skillmesh://store/<name>/SKILL.md`). The active project and store are resolved exactly like the CLI.
