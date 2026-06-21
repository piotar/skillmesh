# skillmesh

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
