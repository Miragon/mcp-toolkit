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
pnpm --filter @miragon/mcp-toolkit-examples build:bundle
pnpm --filter @miragon/mcp-toolkit-examples dev:host
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

- `core/tools/*` may import the `mcp-use` server runtime (the root
  `mcp-use` entry since 2.x). Anything in `core/src/*` outside `tools/`
  must stay browser-bundle-safe (no `mcp-use` server runtime, no
  `node:*`).
- `ui` may import browser-safe `core` runtime (anything in `core/src/*`
  outside `tools/`) as well as `core` types — e.g. `normalizeLayout` from
  `core/src/framework/layout-types.ts`. It must never import `core/tools`,
  which pulls in the `mcp-use` server runtime.
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

The packages publish to the public npm registry (`https://registry.npmjs.org`,
scope `@miragon`, public access) via npm **trusted publishing** (OIDC): no
`NPM_TOKEN` secret, and each publish carries a provenance attestation. All
three packages share one version, tracked in the root `package.json`
(release-please bumps them in lockstep). Releases are automated via
[release-please](https://github.com/googleapis/release-please) driven by
Conventional Commits — no changeset workflow.

> Trusted publishing must be configured once per package on npmjs.com
> (package → Settings → Trusted publishing → GitHub Actions: this repo +
> `.github/workflows/publish-npm-package.yml`). Until a package exists on npm
> it has no settings page, so the **very first** version of each package is
> published manually from a maintainer's machine (`npm login`, then
> `pnpm publish -r --filter @miragon/mcp-toolkit-core --filter @miragon/mcp-toolkit-tool-codegen --filter @miragon/mcp-toolkit-ui --access public --no-git-checks`).

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
3. The same workflow's `publish-core` / `publish-tool-codegen` / `publish-ui`
   jobs are gated on `needs.release-please.outputs.release_created == 'true'`.
   Each calls the reusable `.github/workflows/publish-npm-package.yml`, which
   publishes one package to npm via OIDC (with `--provenance`) and **skips**
   any package whose current version is already on npm — so a partially failed
   release can be safely re-run by re-dispatching. They chain off the action
   output rather than the `v*` tag for a deterministic, single publish per
   release.

Dispatching `release-please.yml` manually with `dry_run: true` runs the
**dry-run** job only (no Release PR, no release): it typechecks, builds, and
packs all three packages against the public registry to validate packaging
without uploading.

Commit messages follow [Conventional Commits](https://www.conventionalcommits.org/):
additive changes → `feat`, bug fixes → `fix`, observable breaking changes →
`feat!`/`fix!` with a `BREAKING CHANGE:` footer.

## See also

- [`docs/README.md`](docs/README.md) — overall doc map.
- [`docs/getting-started.md`](docs/getting-started.md) — minimal host snippet.
- [`examples/README.md`](examples/README.md) — playground layout.
