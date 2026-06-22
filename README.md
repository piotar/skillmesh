# skillmesh

[![npm version](https://img.shields.io/npm/v/skillmesh.svg)](https://www.npmjs.com/package/skillmesh)
[![license: MIT](https://img.shields.io/npm/l/skillmesh.svg)](./LICENSE)
[![node: >=18](https://img.shields.io/node/v/skillmesh.svg)](https://nodejs.org)

A registry and manager for **AI agent skills** — install, update, link and compose skills
(presets) from git, npm, GitHub and local paths, following the
[agentskills.io](https://agentskills.io) standard.

Think of it as a package manager for skills: a shared content store, deterministic lockfiles,
link-based installs and reusable presets — while your project stays clean (only the skills
themselves ever land in it).

---

## Install

Runs on **Node (≥18) or [Bun](https://bun.com)**. `git` and `npm` are used only when fetching from
those sources; `tar` (bsdtar, bundled with Windows 10+/macOS/Linux) is used for archives.

Install the CLI globally with whichever package manager you use — `skillmesh upgrade` later updates
it the same way:

```bash
npm install -g skillmesh     # or: bun add -g skillmesh / pnpm add -g skillmesh / yarn global add skillmesh
skillmesh init
```

Or run it without installing:

```bash
bunx skillmesh add owner/repo   # or: npx skillmesh add owner/repo
```

> Building from source instead? See [Development](#development).

---

## Quick start

```bash
skillmesh init                              # register the current project (writes nothing into it)
skillmesh add ./skills/my-skill             # install a local skill (linked by default)
skillmesh add owner/repo --path skills/foo  # install from GitHub, from a subdirectory
skillmesh add                               # no source → pick from already-cached skills
skillmesh list                              # see what's installed
skillmesh cache list                        # see every skill cached across all projects
skillmesh sync                              # after cloning a repo, install skills from the lockfile
```

---

## Concepts

### Nothing but skills in your project

skillmesh never writes config or lockfiles into your project. The only thing it puts there are the
skills themselves, under your configured `skillsDirs` (default `[".claude/skills"]`). All management
state lives in the global home, keyed by project path (Claude-style):

```
~/.skillmesh/
├── config.json                       # active project + presets
├── auth.json                         # per-host tokens for private sources (0600)
├── store/                            # fetched skill content, keyed by name@version
└── projects/
    └── C--Users-you-project/         # per-project state (encoded path)
        ├── config.json               # skillsDirs, defaultMode, projectLock
        └── lock.json                 # the home (local) lockfile
```

#### Multiple agents (mirrored skill dirs)

`skillsDirs` is a list, so one project can serve several agents at once — each managed skill is
mirrored (linked/copied) into every directory, and `sync`/`doctor` keep them aligned. `init` offers
presets for the common platforms plus any custom paths:

| Platform | Directory |
| --- | --- |
| Claude Code | `.claude/skills` |
| OpenAI Codex CLI | `.codex/skills` |
| Gemini CLI | `.gemini/skills` |
| JetBrains Junie | `.junie/skills` |
| Cross-agent alias (Codex/Gemini/Cursor) | `.agents/skills` |

```bash
skillmesh init --skills-dir .claude/skills,.codex/skills,.agents/skills
```

Gitignore the installed skills yourself, e.g. add `.claude/skills/` to your `.gitignore`.

### Store + link vs. copy

Fetched skills are cached once in the global **store** (`name@version`). Installing then either:

- **links** them into the project (default) — a junction on Windows (no admin needed) or a
  directory symlink on POSIX; or
- **copies** them (`--mode copy`) — an independent copy.

Renamed skills (see conflicts below) are always copied, because their `SKILL.md` `name` must be
rewritten to match the directory and the shared store must not be mutated.

Because the store is shared across every project, a skill fetched once can be reused anywhere
**without re-downloading**: run `skillmesh add` with no source to pick from the cache (multi-select),
or `skillmesh preset add <name>` with no source to compose a preset the same way. Cache installs
materialize content straight from the store but record the skill's **original origin** (from the
store entry's provenance metadata), so `update` still re-fetches from source and presets stay
portable. Browse and prune the cache with `skillmesh cache list` / `skillmesh cache remove
<name[@version]>`.

### Pristine skills, managed by the lockfile

An installed skill directory is **byte-for-byte the upstream artifact** — skillmesh writes no marker
file next to your `SKILL.md`. Whether a skill is **managed** (vs **project-local**, hand-authored) is
derived from the lockfile; a skill installed as a link counts too, so `doctor` can still flag a
store-linked skill that isn't recorded. Store provenance (a skill's origin source + version) lives in
a sibling `<name@version>.json` next to the content directory in the global store, never inside it.

### Two lockfiles (optional)

- The **home lock** always records what's installed on this machine.
- An opt-in **project lock** (`skillmesh.lock.json`, committed to git) records the shareable set for
  the team/CI. Enable continuous maintenance with `skillmesh init --project-lock`.

When both exist they are merged into the effective set; on a name conflict the **committed project
lock wins**, and the home lock contributes any local-only skills. A fresh clone runs
`skillmesh sync` to install everything declared in the committed lock.

**Round-trip on demand.** If you keep `projectLock` off but occasionally want to commit, use
`skillmesh lock export` to write `skillmesh.lock.json` from the current managed skills, and
`skillmesh lock import` to adopt a committed `skillmesh.lock.json` back into local state and install
its skills (fold-in + `sync` in one step) — no need to enable continuous project-lock.

### Name conflicts & the standard

The agentskills.io spec requires a skill's `name` to be lowercase-kebab and to equal its directory
name. On add, skillmesh normalizes non-compliant names and, on a collision with an existing skill,
asks for a new name (suggesting `name-2`, …) and rewrites `SKILL.md` to match.

---

## Sources

`add` accepts several source forms (explicit `scheme:` wins; otherwise it's inferred):

| Form | Example |
| --- | --- |
| Local path | `./skills/foo`, `/abs/path`, `file:./foo` |
| Git | `https://host/repo.git`, `git+ssh://…`, `git@host:owner/repo.git` |
| GitHub shorthand | `owner/repo`, `github:owner/repo#v1` |
| npm | `npm:pkg`, `pkg@1.2.3`, `@scope/pkg` |
| Tarball | `https://host/skill.tgz`, `tarball:…` (`.tar.gz`/`.tgz`/`.tar`/`.zip`) |

Refs and subdirectories can also be passed as flags: `--ref <branch|tag|commit>` and
`--path <subdir>`.

### Private sources (authentication)

Two ways to authenticate against private hosts:

1. **Lean on your existing tooling.** Git sources shell out to `git clone`, so SSH keys, a git
   credential manager or `url.<base>.insteadOf` all just work. npm sources shell out to `npm pack`,
   which honors your `~/.npmrc` (private/enterprise registries and `_authToken`) with no extra setup.
2. **`skillmesh auth`** — a per-host token store for the cases the above don't cover: **git over
   HTTPS** and **private tarball** downloads. Tokens live in one place (`~/.skillmesh/auth.json`,
   keyed by host) so updating many private repos needs no environment juggling, and they are injected
   only at fetch time — **never written into the lockfile, store metadata or any source URL**, so a
   token typed once cannot leak into your project.

```bash
skillmesh auth add gitlab.example.com               # prompts for the token (hidden input)
skillmesh auth add gitlab.example.com --token <tok> --scheme private-token
skillmesh auth list                                 # configured hosts (tokens masked)
skillmesh auth remove gitlab.example.com
```

`--scheme` selects how the token is presented (default `basic` — token as the password, works for
both GitHub and GitLab; `bearer`; or `private-token` for GitLab's header). `--username` sets the
basic-auth user (default `oauth2`). A token value of the form `${ENV_NAME}` is read from the
environment at use time, as an optional convenience for CI. The file is written `0600` where the OS
supports it; keep it out of version control. (Note: for the `basic`/`bearer` schemes the token is
passed to the child `git` process's argument list, so it is briefly visible to local `ps`.)

GitHub shorthands (`owner/repo`) resolve to `github.com` over HTTPS, so a `github.com` entry covers
them too. npm registry auth stays in `~/.npmrc` (option 1 above).

---

## Commands

| Command | Description |
| --- | --- |
| `init [dir] [--skills-dir <d>] [--mode <link\|copy>] [--project-lock] [-y]` | Register a project (state stored in home; nothing written into the project). |
| `add [source] [--ref] [--path] [--mode] [--local]` | Fetch and install a skill. Omit `source` to pick (multi-select) from already-cached skills. `--local` keeps it out of the committed project lock. |
| `remove [name]` | Uninstall managed skills and drop them from the lockfiles (store cache kept). Omit `name` to pick (multi-select) from the installed skills. |
| `update [name]` | Re-fetch a skill from its recorded source and reinstall. Omit `name` to update **all** managed skills. |
| `sync` | Install skills declared in the lockfile that are missing locally (e.g. after cloning). |
| `lock export \| import` | `export` writes `skillmesh.lock.json` from the current managed skills (for committing); `import` adopts a committed `skillmesh.lock.json` into local state and installs its skills. |
| `list` | List skills in the project (managed and project-local) with status. |
| `cache list \| remove [name[@version]]` (alias `store`) | Inspect or prune the global cache of fetched skills (shared across all projects). `remove` with no target picks (multi-select) from the cache. |
| `auth add <host> [--token] [--scheme] [--username] \| list \| remove <host>` | Manage per-host credentials for private git-over-HTTPS and tarball sources (stored in `~/.skillmesh/auth.json`). |
| `validate` | Validate installed skills against the agentskills.io standard. |
| `status` (alias `doctor`) | Report install health for the active project: missing skills, broken links and lockfile drift. |
| `stats` | Show the skillmesh home path plus a summary of the cached store, tracked projects, plugins and the active project. |
| `preset list \| create <name> \| add <name> [source] \| remove [name] [source] \| delete [name] \| apply [name]` | Manage and apply named sets of skills. Omit `source` to pick skills from the cache, or `name` to pick a preset. |
| `plugin add <source> \| list \| enable [name] \| disable [name] \| remove [name]` | Install/manage ecosystem-wide plugins (source adapters & manifest importers). Omit `name` on enable/disable/remove to pick (multi-select). |
| `import [--mode] [--local]` | Import skills from foreign project manifests detected by enabled plugin importers. |
| `upgrade` (alias `self-update`) `[--check] [-y]` | Update skillmesh itself to the latest npm release. `--check` only reports; `-y` skips the prompt. |

### Keeping skillmesh up to date

`skillmesh upgrade` (alias `self-update`) updates the tool itself. It reads the latest version
straight from the registry — honoring your `.npmrc` (private/enterprise registry and auth token),
and needing no `npm` binary, so it works under Bun-only installs. It then installs with **whichever
package manager you installed skillmesh with** — npm, Bun, pnpm or yarn, detected automatically:

```bash
skillmesh upgrade            # check, confirm, install (via the detected package manager)
skillmesh upgrade --check    # only report whether a newer version exists
skillmesh upgrade -y         # install without the confirmation prompt
```

**Auto-upgrade is on by default.** A throttled check (once per day, cached in the global home) runs
on startup; when a newer release exists, skillmesh installs it and transparently re-runs your command
on the new version. Opt out with `SKILLMESH_NO_AUTO_UPGRADE=1`, in which case it falls back to a
passive "update available" notice — which you can also silence with `SKILLMESH_NO_UPDATE_CHECK=1`.

### Plugins

Plugins extend skillmesh without forking it. A plugin is an external JS module (shipped in its own
repository) that can provide either or both of:

- **Source adapters** — teach skillmesh to fetch from a new ecosystem. An adapter claims its own
  `scheme:` prefix on the CLI, so `skillmesh add pypi:requests` is handled by the `pypi` adapter
  exactly like a built-in source.
- **Manifest importers** — read a *foreign* manifest in your project and expand it into a set of
  skill sources, which `skillmesh import` then adds.

Plugins are installed **ecosystem-wide** (into `~/.skillmesh/plugins/`, not per-project) from any
supported source, and are enabled on install:

```bash
skillmesh plugin add owner/repo        # install from any source (npm/git/github/tarball/local)
skillmesh plugin list                  # what's installed, enabled/disabled, and where from
skillmesh plugin disable <name>        # keep it installed but stop loading it
skillmesh plugin enable  <name>
skillmesh plugin remove  <name>        # uninstall from the ecosystem
skillmesh import                       # run enabled importers against the active project
```

A plugin package declares itself via a `skillmesh` field in its `package.json`
(`{ "skillmesh": { "plugin": "./index.js", "apiVersion": 1 } }`) whose entry default-exports a
`Plugin` (`{ meta, sources?, importers? }`). Enabled plugins are loaded **in-process** on every
command — only install plugins you trust. Plugins declaring a different `apiVersion` are skipped.

A source adapter's `fetch(payload, ctx)` and an importer's `load(projectDir, ctx)` receive a
read-only `PluginContext` — `{ home, headerForUrl(url) }`. `headerForUrl` resolves a private host's
credential from skillmesh's own store (`skillmesh auth`), so an adapter fetching from an
authenticated registry reuses the configured token instead of re-reading `auth.json` itself.

#### The plugin contract (copy this)

skillmesh has no runtime types to import, so a plugin is structurally typed against this contract —
copy it into your plugin (e.g. `types.ts`) and implement it. It mirrors `src/plugin/types.ts`.

```ts
/** What your plugin module default-exports. */
export type Plugin = {
  meta: { name: string; apiVersion: 1 };
  sources?: SourceAdapter[];     // new `scheme:` source kinds
  importers?: ManifestImporter[]; // foreign-manifest importers
};

/** Read-only handle skillmesh passes to fetch()/load(). */
export type PluginContext = {
  /** The resolved skillmesh home directory. */
  home: string;
  /** Auth header for a URL, resolved from skillmesh's per-host store (`skillmesh auth`), or undefined. */
  headerForUrl(url: string): Promise<AuthHeader | undefined>;
};
export type AuthHeader = { name: string; value: string };

/** The outcome of fetching a source: a directory holding a SKILL.md, plus its version + cleanup. */
export type FetchResult = {
  dir: string;
  version: string;
  cleanup: () => Promise<void>;
};

/** Teaches skillmesh a new source kind, claimed by a `scheme:` prefix on the CLI. */
export type SourceAdapter = {
  /** Unique id for this adapter; also the `adapter` field of the sources it emits. */
  type: string;
  /** CLI prefix this adapter claims, e.g. "pypi" → `skillmesh add pypi:requests`. */
  scheme?: string;
  /** Parse a raw CLI string into your opaque payload, or null when it isn't yours. */
  parse(input: string): Record<string, unknown> | null;
  /** Download + extract the payload into a local skill dir. */
  fetch(payload: Record<string, unknown>, ctx: PluginContext): Promise<FetchResult>;
  /** Optional one-line origin shown in `list`/`preset list`. */
  describe?(payload: Record<string, unknown>): string;
  /** Optional structural equality (defaults to a deep value comparison). */
  equals?(a: Record<string, unknown>, b: Record<string, unknown>): boolean;
};

/** Reads a foreign manifest and expands it into skill sources for `skillmesh import`. */
export type ManifestImporter = {
  name: string;
  detect(projectDir: string): boolean | Promise<boolean>;
  /** Return sources to add; for plugin-fetched skills emit a PluginSourceSpec. */
  load(projectDir: string, ctx: PluginContext): Promise<SourceSpec[]>;
};

/** A source resolved by your own adapter — the variant a plugin produces. */
export type PluginSourceSpec = {
  type: "plugin";
  adapter: string; // must equal your SourceAdapter.type
  payload: Record<string, unknown>;
};

/** What an importer may return: your plugin source, or any built-in skillmesh source
 *  (git/github/npm/tarball/local), kept loose here so you don't have to copy the whole union. */
export type SourceSpec = PluginSourceSpec | { type: string; [key: string]: unknown };
```

Minimal skeleton — `package.json` plus the entry module:

```jsonc
// package.json
{ "skillmesh": { "plugin": "./index.js", "apiVersion": 1 } }
```

```ts
// index.ts (build/ship as index.js — skillmesh dynamic-imports it under Node)
import type { Plugin } from "./types";

const plugin: Plugin = {
  meta: { name: "my-plugin", apiVersion: 1 },
  sources: [
    {
      type: "myreg",
      scheme: "myreg",
      parse: (input) => (input.startsWith("myreg:") ? { id: input.slice(6) } : null),
      async fetch(payload, ctx) {
        const url = `https://registry.example.com/${payload.id}.tgz`;
        const header = await ctx.headerForUrl(url); // reuse `skillmesh auth` credentials
        // …download to a temp dir, extract so SKILL.md sits at its root…
        return { dir: "/tmp/extracted", version: "1.0.0", cleanup: async () => {} };
      },
      describe: (payload) => String(payload.id),
    },
  ],
};

export default plugin;
```

> The entry must be runnable JS *as installed* — skillmesh copies the plugin dir into
> `~/.skillmesh/plugins/` and dynamically imports it under Node, with **no build step on install**.
> So either ship plain ESM `.js`, or commit your built output and point `skillmesh.plugin` at it.

### Presets

A preset is a named set of skill sources (one source may live in several presets):

```bash
skillmesh preset add dev ./skills/unit-tests
skillmesh preset add dev owner/repo --path skills/code-rules
skillmesh preset add dev           # no source → pick from already-cached skills (multi-select)
skillmesh preset apply dev         # add all of the preset's skills to the active project (idempotent)
```

A preset always stores each skill's **origin** source (resolved from the cache when picked
interactively), so `preset apply` re-fetches from source and the preset stays portable across machines.

---

## Environment

| Variable | Purpose |
| --- | --- |
| `SKILLMESH_HOME` | Override the global home (default `~/.skillmesh`). |
| `SKILLMESH_PROJECT` | Override the active project path (else: the enclosing initialized project, walking up from cwd → cwd). |
| `SKILLMESH_NO_AUTO_UPGRADE` | Opt out of the default startup auto-upgrade (fall back to a notice only). |
| `SKILLMESH_NO_UPDATE_CHECK` | Also suppress the "update available" notice (the auto-upgrade fallback). |
| `SKILLMESH_DEBUG` | Print full stack traces on failure (default: a clean one-line error message). |

---

## Development

Build and run from a clone (no global install needed):

```bash
bun install
bun run build                    # bundle the CLI into dist/index.js
node ./dist/index.js <command>   # run the built CLI under Node
```

For development you can run the TypeScript entry directly with Bun (no build step):

```bash
bun run ./src/cli/index.ts <command>
```

Quality gates:

```bash
bun test           # run the test suite (bun:test)
bun run typecheck  # tsc --noEmit
bun run lint       # eslint
bun run build      # bundle to dist/index.js (target: node)
```

The shipped CLI runs on Node and Bun. Tests are Bun-only and never shipped; the build
(`scripts/build.ts`) bundles to `dist/index.js` with a Node shebang.

The code is organized by domain: `config/` (paths, global & per-project state), `skill/`
(frontmatter, validation, normalization), `manifest/`, `store/`, `link/`, `sources/`, `preset/`
and `registry/` (orchestration), with the CLI in `cli/`.

---

## License

[MIT](./LICENSE) © Piotr Tarasiuk
