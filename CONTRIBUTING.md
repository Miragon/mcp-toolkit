# Contributing to `mcp-toolkit`

## External contributions

We're currently not accepting pull requests from outside the team. We don't have the resources to fully review and validate external contributions, so we can't guarantee that a merged change keeps the project free of bugs, free of security vulnerabilities or malicious code, and consistent with requirements that make sense for it. Pull requests opened by external contributors will be closed.

If you've found a bug or have an idea, please [open an issue](https://github.com/Miragon/mcp-toolkit/issues/new) instead. We read every one, and it's the best way to get something onto our radar.

## Setup

You need Node.js 22.22.2 or newer and pnpm 10.32.1 (pinned in `packageManager`; `corepack enable`
picks it up).

```sh
pnpm install
pnpm build   # the packages resolve each other through their built dist
```

The workspace holds the three packages under `packages/` and the example under `examples/tasks`.
[`CLAUDE.md`](CLAUDE.md) describes the layout, the dependency boundaries between the packages and
the generator's security rules; read it before changing the generator.

## Before you open a pull request

```sh
pnpm build && pnpm typecheck && pnpm test && pnpm lint && pnpm format:check
pnpm check:exports
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

## Commits and releases

Commit messages and pull request titles follow
[Conventional Commits](https://www.conventionalcommits.org/): `feat` for additions, `fix` for bug
fixes, `feat!`/`fix!` with a `BREAKING CHANGE:` footer for breaking changes. A scope can name
the package (`feat(tool-codegen-react): …`). [release-please](https://github.com/googleapis/release-please)
builds the version bump and `CHANGELOG.md` from them, so never edit the changelog by hand. The
release flow is described in the [README](README.md#releases).
