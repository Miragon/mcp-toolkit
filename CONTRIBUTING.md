# Contributing to `mcp-toolkit`

Thanks for working on the toolkit. Read this top-to-bottom once — it
covers the workspace layout, build/test loop, and the conventions the
codebase enforces.

## Workspace

pnpm monorepo (`pnpm-workspace.yaml`):

```
packages/
├── core/             runtime + types + framework helpers + tool registrars
│                       (incl. buildProxyAppConfigs in core/src/proxy/)
├── ui/               React primitives + composed components + McpAppView
├── proxy-contract/   Zod schemas + parser for MCP_PROXIES
└── tool-codegen/     CLI + runtime types + TypedCallTool helper

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

Node 20+ (CI runs on 22 — `actions/setup-node@v6` with `node-version: 22`) and
pnpm 10.32.1 (pinned in `packageManager`).

## Daily loop

```sh
# Watch + iterate
pnpm -r --parallel run dev          # if a package opts into a dev script

# Check before pushing
pnpm -r build
pnpm -r typecheck
pnpm test          # root alias for `pnpm -r --if-present run test`
pnpm -r lint       # lint scripts run with --max-warnings 0 (matches lint-staged + CI)
```

`prettier --write .` (or `pnpm format`) before commit; `lint-staged` runs
it automatically via husky.

## Examples-driven development

Working on a `core` or `tool-codegen` change? Add or adapt a tiny
scenario in `examples/` and exercise it:

```sh
pnpm --filter @miragon/mcp-toolkit-examples dev:articles-upstream    # terminal 1
pnpm --filter @miragon/mcp-toolkit-examples dev:customers-upstream   # terminal 2
pnpm --filter @miragon/mcp-toolkit-examples dev:host                 # terminal 3
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
  outside `tools/` must stay browser-bundle-safe (no `mcp-use/server`,
  no `node:*`).
- `ui` may import browser-safe `core` runtime (anything in `core/src/*`
  outside `tools/`) as well as `core` types — e.g. `normalizeLayout` from
  `core/src/framework/layout-types.ts`. It must never import `core/tools`,
  which pulls in `mcp-use/server`.
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

The packages publish to GitHub Packages (`https://npm.pkg.github.com`,
scope `@miragon`, restricted access). Current published version: `0.3.1`.
Releases are automated via [release-please](https://github.com/googleapis/release-please)
driven by Conventional Commits — no changeset workflow.

The flow (`.github/workflows/release-please.yml`):

1. Merging Conventional Commits to `main` runs `release-please`, which opens
   or updates a release PR aggregating the changes and bumping versions.
   `release-please` runs under a **GitHub App token**
   (`vars.RELEASE_APP_ID` + `secrets.RELEASE_APP_PRIVATE_KEY`) rather than the
   default `GITHUB_TOKEN`, so the Release PR and release commit it pushes
   trigger CI — commits made with the default `GITHUB_TOKEN` do not start a
   follow-up workflow run, which would leave the Release PR's required
   `Typecheck + Build` check forever pending.
2. Merging that release PR makes `release-please` cut a GitHub release and
   push a `v*` tag, setting its `release_created` output to `true`.
3. The same workflow's `publish` job is gated on
   `needs.release-please.outputs.release_created == 'true'` and publishes the
   four packages. It chains off the action output rather than the `v*` tag for
   a deterministic, single publish per release.

`.github/workflows/release.yml` is the **manual fallback**
(`workflow_dispatch` only): dispatch it to re-publish `main` after a failed
automatic run, or with `dry_run: true` to validate registry auth without
uploading.

Commit messages follow [Conventional Commits](https://www.conventionalcommits.org/):
additive changes → `feat`, bug fixes → `fix`, observable breaking changes →
`feat!`/`fix!` with a `BREAKING CHANGE:` footer.

## See also

- [`docs/README.md`](docs/README.md) — overall doc map.
- [`docs/getting-started.md`](docs/getting-started.md) — minimal host snippet.
- [`examples/README.md`](examples/README.md) — playground layout.
