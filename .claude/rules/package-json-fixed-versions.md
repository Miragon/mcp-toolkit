---
paths:
  - "**/package.json"
---

# Always use fixed dependency versions

Never use version ranges (`^`, `~`, `>=`, `*`) in `dependencies` or
`devDependencies`. Always pin to an exact version (e.g. `"eslint": "10.12.0"`).

When adding a new dependency: install it first with `pnpm add`, then read the exact installed version from `pnpm list` or `pnpm-lock.yaml` and write that exact version into `package.json`.

`peerDependencies` are the exception: published packages declare **ranged**
peers so consumers deduplicate against their own copy instead of hitting peer
mismatches (`react` and `@tanstack/react-query` with `^`, and `workspace:~`
for `@miragon/*` packages). Each peer is also a devDependency (exact, or
`workspace:*` for `@miragon/*`), so the workspace builds and tests against one
known version. The `Lint + Format` CI
job enforces exact pins on deps/devDeps (`miragon/pin-npm-dependencies`).
