---
"skillmesh": minor
---

Keep installed skills pristine and add `lock export`/`lock import`.

Installed skill directories (and store entries) are now byte-for-byte the upstream artifact: the
`.skillmesh.json` sidecar is gone. A skill's "managed" status is derived from the lockfile (a
link-installed skill counts too), and store-entry provenance (origin source + version) lives in a
sibling `<name@version>.json` next to the content directory in the global store.

New `skillmesh lock export` writes `skillmesh.lock.json` from the current managed skills, and
`skillmesh lock import` adopts a committed `skillmesh.lock.json` into local state and installs its
skills — round-tripping the committed lock on demand without enabling continuous `projectLock`.
