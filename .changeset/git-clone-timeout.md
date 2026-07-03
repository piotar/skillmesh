---
"skillmesh": patch
---

Fix `materializeGit` hanging forever when git falls back to an interactive
username/password prompt (e.g. the extraHeader auth isn't accepted by the
host's git-http backend).

`exec` now accepts an `env` override, and the clone step sets
`GIT_TERMINAL_PROMPT=0` (so git fails fast with "terminal prompts disabled"
instead of blocking) plus a 30s `timeoutMs` backstop in case some other path
still blocks.
