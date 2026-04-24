# Contributing to `mcp-toolkit`

Thanks for working on the toolkit. Read this top-to-bottom once — it
covers the workspace layout, build/test loop, and the conventions the
codebase enforces.

## Workspace

pnpm monorepo (`pnpm-workspace.yaml`):

```
packages/
├── core/             runtime + types + framework helpers + tool registrars
├── ui/               React primitives + composed components + McpAppView
├── proxy-contract/   Zod schemas + parser for MCP_PROXIES
└── tool-codegen/     CLI + runtime types + buildProxyAppConfigs

examples/             standalone playground (not published)
docs/                 reference + concepts + guides + recipes
```

`examples/` joins the workspace via `examples` in `pnpm-workspace.yaml` —
its `workspace:*` deps resolve to the package sources, so any breakage
in the packages surfaces in `examples` typecheck first.

## Setup

```sh
pnpm install
pnpm -r build         # run package build steps once
pnpm -r typecheck
```

Node 20+ and pnpm 10.32.1 (pinned in `packageManager`).

## Daily loop

```sh
# Watch + iterate
pnpm -r --parallel run dev          # if a package opts into a dev script

# Check before pushing
pnpm -r typecheck
pnpm -r lint
```

`prettier --write .` (or `pnpm format`) before commit; `lint-staged` runs
it automatically via husky.

## Examples-driven development

Working on a `core` or `tool-codegen` change? Add or adapt a tiny
scenario in `examples/` and exercise it:

```sh
pnpm --filter @miragon/mcp-toolkit-examples dev:upstream    # terminal 1
pnpm --filter @miragon/mcp-toolkit-examples dev:host        # terminal 2
```

The `examples/` README documents the standard render-view flows. Adding
a smoke test to `examples/` is the lightest-weight regression guard the
toolkit has — use it.

## Conventions

### Fixed dependency versions

Never use `^`, `~`, `>=`, or `*`. Pin exact versions in every
`package.json`. To add a dep: `pnpm add <pkg>`, then copy the resolved
version from `pnpm-lock.yaml` into `package.json`. See
[`.claude/rules/package-json-fixed-versions.md`](.claude/rules/package-json-fixed-versions.md).

### TypeScript

- ESM only (`"type": "module"`). Use `.js` extensions in relative
  imports — TS-emitted files reference compiled `.js`.
- `tsconfig.base.json` is the single source of truth for compiler
  options.
- Public exports flow through each package's `src/index.ts`. Sub-paths
  (e.g. `core/tools`, `ui/app`) are listed in the package `exports`
  field — keep that map and `src/` layout in sync.

### File / module boundaries

- `core` may depend on `proxy-contract`. Other directions are forbidden.
- `core/tools/*` may import `mcp-use/server`. Anything in `core/src/*`
  outside `tools/` must stay browser-bundle-safe.
- `ui` may depend on `core` for types only — never import `core/tools`.
- `tool-codegen` is a build-time tool. Don't import it from runtime
  code; widget bundles import from `tool-codegen/runtime` (types only).

### Comments

The codebase keeps comments to the necessary minimum: the _why_, not
the _what_. Don't add running commentary; well-named identifiers carry
their own meaning. JSDoc on exported types/functions is fine when it
captures hidden constraints.

## Documentation

Every public symbol lives in a `docs/reference/api-*.md` file with a
signature and a one-line description. Every guide ends with a pointer
into `examples/` for runnable code.

Definition of done for a toolkit feature: code + types + at least one
example exercise + docs entry. Don't merge a feature without the docs.

## Releasing

(Pending — currently not published. Once published, document the
changeset workflow here.)

## See also

- [`docs/README.md`](docs/README.md) — overall doc map.
- [`docs/getting-started.md`](docs/getting-started.md) — minimal host snippet.
- [`examples/README.md`](examples/README.md) — playground layout.
