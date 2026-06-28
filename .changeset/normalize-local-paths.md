---
"skillmesh": patch
---

Normalize local source paths to absolute when parsing, so presets stored in the global config resolve the same regardless of the working directory. `~`-rooted paths are kept as-is to stay portable across machines. Configs written before this change are migrated on read: local preset paths are canonicalized and any sources that collapse to the same path are deduplicated.
