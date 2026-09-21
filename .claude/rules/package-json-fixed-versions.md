---
paths:
  - "**/package.json"
---

# Always use fixed dependency versions

Never use version ranges (`^`, `~`, `>=`, `*`) in `dependencies` or
`devDependencies`. Always pin to an exact version (e.g. `"eslint": "9.39.4"`).

When adding a new dependency: install it first with `pnpm add`, then read the exact installed version from `pnpm list` or `pnpm-lock.yaml` and write that exact version into `package.json`.

`peerDependencies` are the exception: published packages declare **ranged**
peers so consumers deduplicate against their own copy instead of hitting peer
mismatches (`react`/`react-dom` `^`, `zod` `^`, `tailwindcss` `^`, and
`workspace:~` for `@miragon/*`). `mcp-use` stays exactly pinned everywhere —
a duplicate `mcp-use` instance breaks the React context and hangs in-widget
queries. `check-pins` enforces exact pins on deps/devDeps only.
