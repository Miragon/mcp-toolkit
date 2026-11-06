# Contributing to `mcp-toolkit`

## External contributions

We're currently not accepting pull requests from outside the team. We don't have the resources to fully review and validate external contributions, so we can't guarantee that a merged change keeps the project free of bugs, free of security vulnerabilities or malicious code, and consistent with requirements that make sense for it. Pull requests opened by external contributors will be closed.

If you've found a bug or have an idea, please [open an issue](https://github.com/Miragon/mcp-toolkit/issues/new) instead. We read every one, and it's the best way to get something onto our radar.

## Setup

You need Node.js 22.22.2 or newer (mcp-use's minimum, which the example and the codegen tests run
on) and pnpm 10.32.1 (pinned in `packageManager`; `corepack enable` picks it up).

```sh
pnpm install
pnpm build   # first: the packages resolve each other through their built dist
```

The workspace holds the three packages under `packages/`, the example under `examples/tasks` and
the docs site under `docs/`.
[`CLAUDE.md`](CLAUDE.md) describes the layout, the dependency boundaries between the packages and
the generator's security rules; read it before changing the generator.

## Before you open a pull request

```sh
pnpm build           # first: the packages resolve each other through their built dist
pnpm typecheck
pnpm test            # every package, the example with its drift gate, and scripts/*.test.mjs
pnpm lint
pnpm format:check
pnpm check:exports   # publint and attw against the built packages
```

All of it must pass; CI runs the same checks. `pnpm format` and `pnpm lint:fix` fix most format
and lint findings, and the pre-commit hook runs both on the staged files. A change to the
generator's output also needs the example regenerated: start `pnpm serve` in `examples/tasks`,
run `pnpm generate` there and commit the result (its drift test fails otherwise). Keep the server
on port 4000 and `TASKS_MCP_URL` unset, so the files' `// Source:` line stays the same; the drift
check ignores that line, but a changed one is noise in review.

mcp-use, the example's server framework, sends anonymized usage telemetry when the server handles
a request (not under the tests, which run with `NODE_ENV=test`); set
`MCP_USE_ANONYMIZED_TELEMETRY=false` to turn it off.

CI also runs the coverage floors (`pnpm test:coverage`, inline in each `vitest.config.ts`; raise
them, never lower them) and, on pull requests, the mutation tests of tool-codegen and
tool-codegen-core (`pnpm test:mutation`). Pin `dependencies` and `devDependencies` to exact
versions; only peers are ranged.

## Docs

The docs site lives in `docs/`: a VitePress site, the workspace package
`@miragon/mcp-toolkit-docs`, published to <https://miragon.github.io/mcp-toolkit/> by
`.github/workflows/docs.yml` on every push to `main` that touches `docs/`, `pnpm-lock.yaml`,
`pnpm-workspace.yaml` or the generator's `package.json` (the landing page shows its version and
Node.js range, so a release deploys the site again). The pages are the Markdown files in `docs/`; navigation and sidebar are in
`docs/.vitepress/config.ts`. Dependabot leaves the docs pins alone: they move with a kit release.

The 2.x site had other pages under the same base. Each one has a redirect stub in `docs/public/`
at the path it was served from, which sends the reader to the page that took over its topic or to
its file at the tag `v2.9.0`, and the 404 page names that tag (`docs/.vitepress/theme/Layout.vue`).
`scripts/docs-redirects.test.mjs` fails when a stub points at a page that no longer exists or
shadows one: rename or remove a page, and update the stubs that point at it.

The site is the one home of the user documentation. The READMEs, which npm shows, only say what a
package is, show one example and link to the site. A change users see (a config key, a CLI flag
or message, an export, a requirement) updates the pages in the same pull request, and a README only
when its example or requirements change. Package READMEs link the site with absolute
`https://miragon.github.io/mcp-toolkit/...` URLs, since npm does not resolve relative links.

```sh
pnpm --fail-if-no-match --filter @miragon/mcp-toolkit-docs dev     # dev server on http://localhost:5173
pnpm --fail-if-no-match --filter @miragon/mcp-toolkit-docs build   # fails on a dead link; the root pnpm build runs it too
DOCS_BASE=/mcp-toolkit/ pnpm --fail-if-no-match --filter @miragon/mcp-toolkit-docs build   # as the workflow builds it
node docs/.vitepress/miragon/check.mjs                             # the vendored docs kit is unchanged
```

`docs/.vitepress/miragon/` and `docs/public/logo/` are the Miragon docs kit, vendored byte for
byte from [Miragon/corporate-identity](https://github.com/Miragon/corporate-identity) (skill
`docs-site`): theme, colours, fonts, Mermaid and the legal row. Never edit them; `check.mjs` fails
on any change (the Docs workflow runs it), and Prettier and ESLint skip the kit. To lift the kit to
a new release, compare it against a clone of corporate-identity at the new tag:

```sh
node docs/.vitepress/miragon/check.mjs --ci ../corporate-identity
```

When it reports an outdated, new or removed file, copy the kit again from the clone's
`plugins/miragon-brand/skills/docs-site/assets/` (`miragon/` to `docs/.vitepress/miragon/` after
deleting the old folder, `logo/*.svg` to `docs/public/logo/`), run `check.mjs` and build. Carry
changed pins from `assets/vorlagen/package.json` there into `docs/package.json`, and the vite
override and the mermaid peer rule into `pnpm-workspace.yaml`, then run `pnpm install`. When only
the versions in `manifest.json` differ, the kit is unchanged and there is nothing to do.

## Commits

Commit messages and pull request titles follow
[Conventional Commits](https://www.conventionalcommits.org/): `feat` for additions, `fix` for bug
fixes. A breaking change needs `!` (`feat!`, `fix!`) or a `BREAKING CHANGE:` footer on the commit
that lands on `main`. A scope can name the package (`feat(tool-codegen-react): …`). The PR-title
check also validates the subject of a single-commit pull request, which GitHub uses as the squash
title. [release-please](https://github.com/googleapis/release-please) builds the version bump and
`CHANGELOG.md` from the commits, so never edit the changelog by hand.

## Releases

release-please reads the Conventional Commits on `main` and keeps a Release PR open that bumps the
three packages in lockstep and writes `CHANGELOG.md`. Merging the Release PR tags `v<version>` and
creates the GitHub release; then one publish job per package publishes it to npm with trusted
publishing (OIDC, with provenance, no `NPM_TOKEN`), skipping a version that is already on npm. The
jobs run in dependency order (core, then react, then the generator), so generated code never
reaches npm ahead of its runtime. `.github/workflows/publish-npm-package.yml` packs a package in
one job and publishes the tarball from another, the only one with the id-token, which runs no
install, no build and no lifecycle script.

Dispatching `release-please.yml` with `dry_run` packs the three packages without publishing;
`force_publish` (on `main` only) publishes the versions in `package.json` again after a failed
run.

### Trusted publishing

Trusted publishing is configured per package on npmjs.com (Settings → Trusted publishing → GitHub
Actions): this repository, the workflow `release-please.yml` (npm checks the calling workflow, not
the reusable one) and the environment `npm`. `npm trust list @miragon/mcp-toolkit-tool-codegen`
shows the configuration that works; copy it.

The `npm` environment has no protection rules (owner decision): no branch rule and no required
reviewer. What keeps publishing on `main` is the workflow itself, whose publish jobs run only for a
release that release-please created on `main` or for `force_publish` dispatched on `main`
(`scripts/release-config.test.mjs` pins that condition). npm does not check the branch either, so
the boundary is write access to this repository: a changed copy of the workflow, dispatched from
another branch, could publish.

### Adding a package

A package that is not on npm yet has no trusted-publishing settings, and npm expires a new
configuration that sees no publish within two days. To release a new package under `packages/`:

1. Wire it into the release: its `package.json` version in the `extra-files` of
   `release-please-config.json` (one version for every package), and a publish job in
   `release-please.yml` after the jobs of the packages it imports, with the same `if` as the
   others. Extend the publish-order test in `scripts/release-config.test.mjs` with it.
2. Publish a placeholder by hand with pnpm, which rewrites the `workspace:` ranges: in the
   package's directory, set its version to `0.0.0-bootstrap.0` locally (do not commit it) and run
   `pnpm publish --access public --tag bootstrap`. npm may point `latest` at the placeholder until
   the first release replaces it.
3. Configure the package's trusted publisher as above.
4. Within two days of step 3, merge the Release PR that first carries the package (a `feat` or `fix`
   commit opens one): its OIDC publish validates the configuration. Do not publish the release
   version by hand.
