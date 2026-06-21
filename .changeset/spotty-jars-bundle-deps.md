---
"skillmesh": patch
---

Move bundled runtime libraries (`@clack/prompts`, `citty`, `cross-spawn`, `yaml`) from `dependencies` to `devDependencies`. The published package ships a self-contained `dist/index.js` that already inlines them, so listing them as `dependencies` only caused npm to download dead, unused copies on every install.
