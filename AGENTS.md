# AGENTS.md

Guidance for AI agents working in this repo. Read this first instead of re-discovering the project each session.

## What this is

**skillmesh** — a package manager for **AI agent skills** following the [agentskills.io](https://agentskills.io) standard. It installs, updates, links and composes skills (presets) from local paths, git, GitHub, npm and tarballs into a project's skills directory, while keeping the project itself clean (only the skills land in it; all management state lives in a global home keyed by project path).

`package.json` name is `skillmesh`; the dir is `share-skill`.

## Runtime: Node + Bun

The shipped CLI runs on **both Node (≥18) and Bun**. Dev is done with Bun; distribution is a built bundle that runs under Node.

- **Dev:** `bun run ./src/cli/index.ts <cmd>` (or `bun run skillmesh <cmd>`). Source entry keeps the `#!/usr/bin/env bun` shebang.
- **Build:** `bun run build` → `scripts/build.ts` uses `Bun.build({ target: "node" })` to bundle `src/cli/index.ts` into `dist/index.js`, rewrites the shebang to `#!/usr/bin/env node`, and chmods it. `package.json` `bin` points at `dist/index.js`; `files` ships `dist`.
- **Tests stay Bun-only** (`bun:test`, and `Bun.file`/`Bun.write` inside `*.test.ts`). That's fine — tests are dev-only and never shipped.

Cross-runtime abstractions (the port, done 2026-06-21 — do not reintroduce raw `Bun.*` in shipped `src/`):

- File IO: `src/util/fs.ts` `readText`/`writeText` (node:fs/promises), not `Bun.file`/`Bun.write`.
- YAML: `yaml` package's `parse` in `src/skill/frontmatter.ts`, not `Bun.YAML.parse`.
- Subprocess: `cross-spawn` in `src/sources/util.ts`, not `Bun.spawn` — cross-spawn is what makes Windows `npm.cmd` work under Node (Node refuses to spawn `.cmd`/`.bat` without it).

## Commands

```bash
bun install
bun run ./src/cli/index.ts <cmd>   # run the CLI without linking (dev)
bun run skillmesh <cmd>            # same, via package script

bun run build                      # bundle to dist/index.js (Node-runnable)
node ./dist/index.js <cmd>         # run the built CLI under Node

bun test                           # full test suite (bun:test)
bun run typecheck                  # tsc --noEmit
bun run lint                       # eslint
```

CLI subcommands: `init`, `add`, `remove`, `update`, `sync`, `list`, `cache`/`store`, `validate`, `status`/`doctor`, `stats`, `preset`, `plugin`, `import`, `upgrade`/`self-update`. See `README.md` for full flag/source documentation.

`add` and `preset add` take their source positional as **optional**: when omitted (and on a TTY) they
open an interactive multi-select over the global store via `pickCachedSkills` (`src/cli/cachePicker.ts`,
backed by `listStoreEntries`/`latestPerName` in `src/store/store.ts`). Picks install/record the skill's
**origin source** (from its sidecar manifest), not a store pin — so `update` and preset portability are
preserved; `addStoredSkill` (`src/registry/registry.ts`) materializes straight from the cache without
re-fetching. `cache list`/`cache remove` inspect/prune the store. Source-origin rendering is shared in
`src/cli/describeSource.ts` (used by `add`-cache, `list`, `preset`, `cache`).

`upgrade` (alias `self-update`) updates skillmesh *itself*, not skills. Domain in `src/upgrade/`:

- **Version check** (`upgrade.ts` `latestVersion`) fetches `<registry>/<pkg>/latest` over HTTP — no `npm` binary required, so it works under Bun-only installs. Compared against `pkg.version` (single source of truth in `constants.ts`, also feeding the `cli/index.ts` banner).
- **Registry** (`registry.ts`) resolves the registry URL and auth token from `.npmrc` (user + project, env override, `${VAR}` expansion) so private registries work. Don't assume the public registry.
- **Install** uses whichever package manager actually installed the CLI, detected from the running bin's real path (`detectPackageManager`): `npm install -g` / `bun add -g` / `pnpm add -g` / `yarn global add`. Don't hardcode npm.
- **Startup self-management** (`startup.ts` `startupSelfManage`): one throttled check (once/day, cached in home as `update-check.json`). Auto-upgrade is **on by default** — on a fresh check finding a newer release it installs and re-exec's the same command (guarded by the `SKILLMESH_UPGRADED` env to avoid an upgrade→re-exec loop). Opt out with `SKILLMESH_NO_AUTO_UPGRADE`, which falls back to a passive notice (further silenceable with `SKILLMESH_NO_UPDATE_CHECK`). All best-effort: never throws or blocks the command.

Wiring lives in `cli/index.ts`'s `run()` (re-exec before the command, notice after); self-management is skipped for the `upgrade`/`self-update` commands and the `--help`/`--version` banners.

## Architecture

Organized by domain; types are dependency-free in `src/types.ts` to avoid cycles.

- `src/cli/` — citty command tree (`index.ts`) + `commands/*` + `@clack/prompts` UI
- `src/config/` — `paths.ts` (pure path resolution), global & per-project config
- `src/skill/` — frontmatter parse, validation, name normalization (agentskills.io spec)
- `src/sources/` — resolve a source string → fetch (`local`, `git`, `github`, `npm`, `tarball`)
- `src/store/` — global content store (`name@version`)
- `src/link/` — link (junction/symlink) vs copy installs
- `src/manifest/` — `.skillmesh.json` sidecar that marks a skill as managed
- `src/registry/` — orchestration (the "do the work" layer)
- `src/preset/` — named sets of sources
- `src/plugin/` — plugin host + lifecycle (extends source dispatch and adds manifest importers)
- `src/constants.ts` — all file/dir names, env vars, defaults in one place

### Plugins (extension mechanism)

Plugins are external JS modules (in their own repos) that extend skillmesh ecosystem-wide. A plugin
declares itself with a `skillmesh` field in its `package.json` (`{ plugin: entry, apiVersion }`) and
default-exports a `Plugin` (`src/plugin/types.ts`): `meta` + optional `sources` (SourceAdapters) and
`importers` (ManifestImporters).

- **Host** (`src/plugin/host.ts`) is an in-memory singleton, **empty by default** — so
  `parseSource`/`sourceEquals` behave exactly as before with no plugins. Built-in source dispatch
  consults it: `parseSource` falls back to `parseViaPlugins` (matched by the adapter's `scheme:`
  prefix, after the built-in explicit schemes); `fetchSource`/`equals`/`describeSource` handle the
  `"plugin"` SourceSpec variant via the host.
- **Any source installs a plugin.** The fetchers were split into `materialize<Type>` (download to a
  root) + entry validation, dispatched by `src/sources/materialize.ts`. The skill path validates
  with `resolveSkillDir`; the plugin path with `resolvePluginDir` (both in `src/sources/util.ts`).
- **State** lives in the home: installed content under `~/.skillmesh/plugins/<name>@<version>/`,
  registry (enabled flag + source) in `~/.skillmesh/plugins.json` (`src/plugin/registry.ts`).
  `src/plugin/manage.ts` is install/enable/disable/remove; `src/plugin/load.ts` dynamically imports
  enabled plugins at startup (`cli/index.ts` `run()`, before `runMain`) — **best-effort**, like
  startup self-management: a broken/incompatible plugin warns and is skipped, never crashing.
- **Trust:** enabled plugins run in-process (no sandbox); auto-enabled on install; gated only by
  `pluginApiVersion`. Importers are invoked explicitly by `skillmesh import`
  (`importManifests` in `src/registry/registry.ts`, reusing `addSkill`).

### Key design invariants (don't break these)

- **Nothing but skills in the project.** Config + lockfiles live in `~/.skillmesh/` (overridable via `SKILLMESH_HOME`), keyed by an encoded project path. The only project write is the skills under the configured `skillsDirs` (default `[".claude/skills"]`).
- **`skillsDirs` is a list (mirror model).** A managed skill is materialized into *every* configured dir (one per agent, e.g. `.claude/skills` + `.codex/skills`); `add`/`update`/`remove`/`sync` operate across all of them, and `doctor` flags a skill missing from *any* dir. Legacy single-`skillsDir` configs are migrated on read (`migrateConfig` in `src/config/project.ts`).
- `src/config/paths.ts` functions are **pure** — paths depend only on inputs (and ENV only when explicitly passed).
- The store is shared and **immutable per `name@version`**; renamed skills are always *copied* (their `SKILL.md` name is rewritten), never linked.
- Two optional lockfiles: home lock (always) + committed project lock (`skillmesh.lock.json`, opt-in). On conflict the committed project lock wins.
- Env overrides: `SKILLMESH_HOME`, `SKILLMESH_PROJECT`.

## Conventions

- TypeScript strict mode; `noUncheckedIndexedAccess` is on — handle `T | undefined` from index access.
- ESM (`"type": "module"`), `.ts` extension imports allowed (`allowImportingTsExtensions`), `verbatimModuleSyntax` — use `import type` for types.
- **Use camelCase for constants**, not SCREAMING_SNAKE_CASE (`const` already signals immutability) — see `constants.ts` (`envVars`, `dirs`, `files`, `defaults`).
- Tests live next to source as `*.test.ts`.
- File-level `/** ... */` doc comment explaining the module's purpose; match the existing comment density.
