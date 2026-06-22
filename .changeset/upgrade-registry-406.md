---
"skillmesh": patch
---

Fix `skillmesh upgrade` failing with "Registry returned 406". The version check requested `/{pkg}/latest` with the abbreviated `application/vnd.npm.install-v1+json` Accept header, but that media type is only negotiable on the full packument endpoint — registries (including the public npm registry and proxies like Artifactory/Nexus/Verdaccio) reject it with 406 on the version-specific endpoint. It now fetches the packument and reads `dist-tags.latest`.
