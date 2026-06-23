# skillmesh

## 0.4.0

### Minor Changes

- fed04be: Add a read-only MCP server (`skillmesh-mcp`) for skill discovery.

  A new `skillmesh-mcp` binary (or the equivalent `skillmesh mcp` subcommand) exposes your skills to an
  agent over the Model Context Protocol (stdio). It is strictly read-only — the agent can browse and
  read skills but never fetches, installs or changes anything, so installs stay a deliberate human
  action via `skillmesh add`.

  Tools: `list_installed_skills` (active project), `list_available_skills` (the cached store, with an
  optional `query` filter), `list_presets`, and `read_skill` (a skill's full `SKILL.md`, from the store
  or the project). Each cached skill's `SKILL.md` is also offered as an MCP resource
  (`skillmesh://store/<name>/SKILL.md`). The active project and store are resolved exactly like the CLI.

## 0.3.1

### Patch Changes

- 3544384: Fix `skillmesh upgrade` failing with "Registry returned 406". The version check requested `/{pkg}/latest` with the abbreviated `application/vnd.npm.install-v1+json` Accept header, but that media type is only negotiable on the full packument endpoint — registries (including the public npm registry and proxies like Artifactory/Nexus/Verdaccio) reject it with 406 on the version-specific endpoint. It now fetches the packument and reads `dist-tags.latest`.

## 0.3.0

### Minor Changes

- 753af23: Pass a read-only `PluginContext` to plugin source adapters and manifest importers.

  `SourceAdapter.fetch(payload, ctx)` and `ManifestImporter.load(projectDir, ctx)` now receive a
  `PluginContext` (`{ home, headerForUrl(url) }`). `headerForUrl` resolves a private host's credential
  from skillmesh's own per-host store (`skillmesh auth`), so an adapter fetching from an authenticated
  registry reuses the configured token instead of re-reading `auth.json` and reproducing the header
  logic itself. Wired through `fetchSource(source, home?)` and `importManifests`, built by
  `buildPluginContext` (`src/plugin/context.ts`).

  Additive and backwards compatible — `apiVersion` stays `1`; adapters that ignore the new argument
  keep working. The README now documents the full, copy-pasteable plugin contract (types + a minimal
  skeleton).

## 0.2.0

### Minor Changes

- ea36019: Keep installed skills pristine and add `lock export`/`lock import`.

  Installed skill directories (and store entries) are now byte-for-byte the upstream artifact: the
  `.skillmesh.json` sidecar is gone. A skill's "managed" status is derived from the lockfile (a
  link-installed skill counts too), and store-entry provenance (origin source + version) lives in a
  sibling `<name@version>.json` next to the content directory in the global store.

  New `skillmesh lock export` writes `skillmesh.lock.json` from the current managed skills, and
  `skillmesh lock import` adopts a committed `skillmesh.lock.json` into local state and installs its
  skills — round-tripping the committed lock on demand without enabling continuous `projectLock`.

## 0.1.1

### Patch Changes

- faa0f28: Move bundled runtime libraries (`@clack/prompts`, `citty`, `cross-spawn`, `yaml`) from `dependencies` to `devDependencies`. The published package ships a self-contained `dist/index.js` that already inlines them, so listing them as `dependencies` only caused npm to download dead, unused copies on every install.

## 0.1.0

### Minor Changes

- Consistent interactive selection across commands: omit the target on `remove`, `cache remove`,
  `preset apply|delete|remove` and `plugin enable|disable|remove` to pick from a list (multi-select
  where it makes sense), matching the existing behaviour of `add` and `preset add`. Off a TTY, a
  missing target is a clean error telling you to pass it explicitly.

  Expected failures (empty cache, missing skill/preset, no TTY, …) now print a clean one-line message
  instead of a stack trace; set `SKILLMESH_DEBUG=1` to see the full trace.

  Packaging: added a `LICENSE` file (MIT), npm install instructions and a License section to the
  README, and expanded `package.json` keywords.
