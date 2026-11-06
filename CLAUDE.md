# CLAUDE.md

Guidance for agents working in this repo. It ships typed MCP tool calls: a build-time code
generator and the two runtime packages its output imports, plus one example. User-facing docs live
on the docs site in `docs/` (<https://miragon.github.io/mcp-toolkit/>). The READMEs
([`README.md`](README.md) and one per package) say what a package is, show one example and link
there; a change users see updates the site's pages in the same pull request (see
[`CONTRIBUTING.md`](CONTRIBUTING.md#docs)).

## Layout

| Path                           | What it is                                                                                                                                                                                                                                                                                                                                                                                                     |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/tool-codegen/`       | `@miragon/mcp-toolkit-tool-codegen`: the `mcp-tool-codegen` CLI and generator (Node, build time). `src/codegen.ts` renders, `src/declarations.ts` turns a tool's schema into types; `src/identifiers.ts`, `src/safe-text.ts`, `src/sanitize-schema.ts` and `src/schema-refs.ts` hold the security rules; `src/layout.ts` prints width-dependent lines as Prettier would; `templates/` holds the file skeletons |
| `packages/tool-codegen-core/`  | `@miragon/mcp-toolkit-tool-codegen-core`: the runtime of the generated `tools.ts` (`ToolCaller`, `createTypedCallTool`, `parseToolResult`, `ToolCallError`, `toolCallerFromClient`)                                                                                                                                                                                                                            |
| `packages/tool-codegen-react/` | `@miragon/mcp-toolkit-tool-codegen-react`: the runtime of the generated `hooks.tsx` (`ToolCallerProvider`, `useToolQuery`, `useToolMutation`, `toolQueryKey`, `toolQueryOptions`)                                                                                                                                                                                                                              |
| `examples/tasks/`              | `@miragon/mcp-toolkit-example-tasks` (private): an mcp-use server, its committed generated client in `src/generated/`, a Node client, a Vite React app and the drift test                                                                                                                                                                                                                                      |
| `docs/`                        | `@miragon/mcp-toolkit-docs` (private): the VitePress docs site on GitHub Pages; `docs/.vitepress/miragon/` is the vendored Miragon docs kit, never edited (see [`CONTRIBUTING.md`](CONTRIBUTING.md#docs))                                                                                                                                                                                                      |

## Commands

```sh
pnpm install
pnpm build                    # first: the packages resolve each other through their built dist
pnpm typecheck
pnpm test                     # all packages, the example and scripts/*.test.mjs
pnpm test:scripts             # node --test over scripts/: workflow and gate-script shape
pnpm lint                     # pnpm lint:fix to autofix
pnpm format:check             # pnpm format to write
pnpm check:exports            # publint + attw on the built packages
pnpm test:coverage            # package tests against their coverage floors
pnpm test:mutation            # Stryker: tool-codegen and tool-codegen-core
pnpm --filter @miragon/mcp-toolkit-tool-codegen test   # one package
```

After a change to core's or react's public types, run `pnpm build` before typechecking the
dependants: they read the built `.d.ts`.

## Dependency boundaries

ESLint enforces them (`eslint.config.mjs`, `no-restricted-imports` per file scope; a later
flat-config block replaces an earlier block's value for the same rule, so each scope lists all
its patterns).

- **core** is framework-free and has zero dependencies: no React, no `@tanstack/*`, no
  `@modelcontextprotocol/*` (the SDK client is adapted structurally, `McpClientLike`), no Node
  built-ins, no import of the other two packages. It compiles against the ES2022 lib alone
  (`types: []`), so a DOM or Node global fails the build; `src/abort-signal.d.ts` names
  `AbortSignal` without emitting it.
- **react** builds on core with `react` and `@tanstack/react-query` (from 5.48, the first with a
  function `enabled`) as peers. No Node built-ins, never the codegen package. The app owns the
  `QueryClientProvider`; `ToolCallerProvider` only supplies the caller, per namespace (the hooks
  look up their own; a provider without `namespace` serves the rest).
- **codegen** is build-time only: runtime code never imports it (the example only as a type, plus
  `codegen.config.ts` and the tests). The generated `tools.ts` imports only core, `hooks.tsx` only
  react and `./tools.js`; `src/codegen.test.ts` pins a full rendered sample verbatim. Both runtime
  packages are optional peers of codegen (`workspace:~`) and its devDependencies.
- Generated code is type-checked in codegen's tests (`typeErrors` in
  `packages/tool-codegen/src/test-support/typescript.ts`) against core's and react's built `.d.ts`,
  resolved through codegen's node_modules, with `declaration: true` as a library would compile it.
  So `pnpm build` comes before codegen's tests; the example's typecheck is the end-to-end gate.

## Generator security (Miragon/mcp-toolkit#177)

Everything in `tools/list` is untrusted: 2.x copied tool names into generated code unescaped, so
a malicious server could inject code. Keep these rules and the tests that pin them:

- Identifiers come only from the `[A-Za-z0-9]` runs of a tool name or its
  `overrides.<tool>.identifier` (a leading digit gets a `_`). An identifier collision (two tools, a
  tool and an import or a TypeScript global the files use, a tool and the client's `call` or an
  object member JavaScript looks up, such as `then` or `toJSON`) or a name without such characters
  fails generation, naming the owners and the remedy (`NameRegistry`).
- Server text reaches string positions only as JSON string literals (`jsString`; controls, format,
  bidirectional, zero-width and every other default-ignorable character `\u`-escaped per UTF-16
  unit, `escapeInvisible`); a property key stays quoted unless it is a plain ASCII identifier
  (json2ts runs with Prettier's `quoteProps: "preserve"`).
- Schemas are rebuilt from a keyword allowlist before json-schema-to-typescript sees them:
  `tsType`, `tsEnumNames`, `title`, `$id`, `minItems`/`maxItems` are dropped at every depth.
- Only local `$ref`s (`#`, `#/…`) survive, and `normalizeRefs` keeps one only when it walks
  schema positions (own keys) to an object schema; everything else becomes `unknown`. Every target
  but the root moves into the root `$defs` and a `$ref` with siblings becomes `allOf`, because
  json2ts inlines any other target (and the copy it makes for a `$ref` with siblings) at every use:
  exponential output, and unprefixed names for anonymous cycles. `compileSchema` fails on a
  declared name without the tool's prefix. json2ts runs with
  `$refOptions: { resolve: { external: false } }`, so no file is read and no URL called.
- Descriptions cannot close a JSDoc or become a TypeScript directive (a line starting with `@`
  never ends a comment's last line); the `Source:` header is the URL's origin only (a path may hold
  an API key); the CLI replaces invisible characters in server text it prints (`terminalText`) and
  marks every line of an error after the first with ` |`, so none can start a CI log line.
- Config: no credentials in `url`, no line break, control or non-Latin-1 character in a header or
  auth value (fetch would echo the secret); errors name the field, never the value.
- Tests: `src/codegen.security.test.ts` (hostile names, schemas, text, header, `$ref` with a
  control test that proves json2ts alone would read a file and call a server, the exponential
  chains), `src/codegen.property.test.ts` (arbitrary input still parses and declares only its own
  names), `src/identifiers.test.ts`, `src/safe-text.test.ts`, `src/sanitize-schema.test.ts`,
  `src/schema-refs.test.ts`. A change that weakens a rule changes these tests in the same PR, with
  the reason.

## Query or mutation

A tool gets a query hook only when it is annotated `readOnlyHint: true`; every other tool gets a
mutation hook. MCP's `readOnlyHint` defaults to `false`, and a query re-runs its tool on every
mount, focus and invalidation, so an unannotated write must never become a query.
`overrides.<tool>.hook` in the codegen config decides otherwise per tool.

## Generated files

`examples/tasks/src/generated/` is regenerated only with the CLI, never by hand: run `pnpm serve`
and then `pnpm generate` in `examples/tasks` (without `TASKS_MCP_URL` set, so the `Source:` header
keeps naming `http://localhost:4000`). `examples/tasks/test/codegen.test.ts` fails when the
committed files differ from a fresh generation, compared as `generate --check` does: all but the
`Source:` line. Output is deterministic: sorted by tool name, byte-identical on regeneration,
Prettier-clean.

## Quality gates

- Coverage floors sit inline in each package's `vitest.config.ts`. Raise them when coverage
  rises; never lower them to get green.
- Mutation testing (Stryker, `stryker.config.json`) covers tool-codegen and tool-codegen-core.
  Each config's `thresholds.break` fails the run below it; core's is 100, so every new mutant
  there must be killed.
- The GitHub ruleset requires the checks `Typecheck + Build`, `Lint + Format`,
  `Mutation diff gate` (`.github/workflows/ci.yml`) and `Validate PR title`
  (`.github/workflows/pr-title.yml`). Keep those job names.
- The root `test:coverage` and `test:mutation` name each package with its own `--filter`, never
  `pnpm -r --if-present`, which goes green when a script is renamed away.
  `scripts/release-config.test.mjs` (in `Lint + Format`) pins that, the publish order and the
  id-token job's shape (no install, no build, no checkout, no cache), the read-only
  `GITHUB_TOKEN`, the PR-title check of single commits, Dependabot's commit prefixes and its npm
  cooldown, which equals pnpm's `minimumReleaseAge` in `pnpm-workspace.yaml`.
- Tests pin behaviour, not lines. Type-level contracts (unknown tool names, wrong args) are
  pinned with `expectTypeOf` and `@ts-expect-error`; `pnpm typecheck` checks them.

## Conventions

- ESM only; relative imports carry `.js`, also type imports (an ESLint selector enforces it).
- `dependencies`/`devDependencies` are exact pins (`.npmrc` `save-exact=true`, checked in CI).
  Peers are ranged: `react` and `@tanstack/react-query` with `^`, the workspace packages as
  `workspace:~` ([`.claude/rules/package-json-fixed-versions.md`](.claude/rules/package-json-fixed-versions.md)).
- The packages build without source or declaration maps: the tarball ships no `src/`
  (`pnpm check:exports` fails on a packed map that points outside the tarball).
- The three packages share one version. `CHANGELOG.md` belongs to release-please: never edit it.
  Commits and PR titles follow Conventional Commits, which drive the release.
- Code, comments and docs are English. Comments say why, not what.
