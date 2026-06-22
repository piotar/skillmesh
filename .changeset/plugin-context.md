---
"skillmesh": minor
---

Pass a read-only `PluginContext` to plugin source adapters and manifest importers.

`SourceAdapter.fetch(payload, ctx)` and `ManifestImporter.load(projectDir, ctx)` now receive a
`PluginContext` (`{ home, headerForUrl(url) }`). `headerForUrl` resolves a private host's credential
from skillmesh's own per-host store (`skillmesh auth`), so an adapter fetching from an authenticated
registry reuses the configured token instead of re-reading `auth.json` and reproducing the header
logic itself. Wired through `fetchSource(source, home?)` and `importManifests`, built by
`buildPluginContext` (`src/plugin/context.ts`).

Additive and backwards compatible — `apiVersion` stays `1`; adapters that ignore the new argument
keep working. The README now documents the full, copy-pasteable plugin contract (types + a minimal
skeleton).
