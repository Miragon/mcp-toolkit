# CLAUDE.md — `mcp-toolkit`

Project-specific guidance for AI agents and humans working in this repo.

## Module boundaries

Kept in sync with the same rule in `CONTRIBUTING.md`:

- `core/tools/*` may import the `mcp-use` server runtime (the root `mcp-use`
  entry since 2.x). Anything in `core/src/*` outside `tools/` must stay
  browser-bundle-safe (no `mcp-use` server runtime, no `node:*`).
- `ui` may import browser-safe `core` runtime (anything in `core/src/*`
  outside `tools/`) as well as `core` types — e.g. `normalizeLayout` from
  `core/src/framework/layout-types.ts`. It must never import `core/tools`,
  which pulls in the `mcp-use` server runtime.
- The `ui` root barrel (`packages/ui/src/index.ts`) must stay free of
  `mcp-use/react` value imports (they pull in the 2.x view runtime and its
  ext-apps transitive). Symbols that import `mcp-use/react` as a value are
  exported from the `./app` / `./hooks` subpaths, never the root.
- `tool-codegen` is build-time. Don't import it from runtime code; widget
  bundles import from `tool-codegen/runtime` (types only).
- `core` is the bottom of the dependency graph — it must never import
  `@miragon/mcp-toolkit-ui` (already enforced by the eslint boundary rules).

Baseline numbers and the gate roadmap for these rules live in
[`FITNESS.md`](FITNESS.md).

## Building widgets / prompt-ready UI base

UIs are **hand-built and prompted on top of** `@miragon/mcp-toolkit-ui` — they
are not auto-generated. The base is the ground truth a coding agent prompts
against, so reach for the existing building blocks instead of re-deriving them:

- **Component catalog** — [`docs/reference/components.md`](docs/reference/components.md)
  (human) and [`packages/ui/ui-catalog.json`](packages/ui/ui-catalog.json)
  (machine, drift-guarded by `packages/ui/src/ui-catalog.test.ts`). Every
  prompt-relevant component/hook: import path, props, when to use.
- **Skill** — `.claude/skills/build-mcp-widget/SKILL.md` walks the full loop
  (data contract → primitives → host-portable `useHostBridge` → iterate in the
  playground → verify). Invoke it when building a widget or rendering a tool
  result as UI.
- **Iterate loop** — the standard loop is the mcp-use CLI: run
  `pnpm --filter @miragon/mcp-toolkit-examples run dev:standalone` and exercise
  the widget through the built-in inspector (`…/mcp/inspector`, HMR on the
  widget sources; see [`examples/standalone-host`](examples/standalone-host/README.md)).
  For fixture-driven isolation (edge states, theme matrix, no server), add a
  `Story` to
  [`examples/widget-playground/stories.ts`](examples/widget-playground/stories.ts)
  and run `pnpm --filter @miragon/mcp-toolkit-examples run dev:widget-playground`
  (`WidgetFixtureHost`).
- **Reference widgets** —
  [`OrderStatusCard`](examples/host-portability/OrderStatusCard.tsx) (host-portable)
  and [`CustomerCard`](examples/widget-playground/CustomerCard.tsx).

## Skills

Repo-specific agent skills in `.claude/skills/` encode the house patterns with
runnable snippets — invoke the matching one before hand-rolling:

- **[`build-mcp-server`](.claude/skills/build-mcp-server/SKILL.md)** — stand up an
  MCP server: a plain mcp-use project with `installToolkit` on top (standard),
  or a host via `createFrameworkApp` (Node adapter), plus a module that
  registers its **own** tools (`createToolRegistrar`) and a widget. The worked
  example is the [`tasks` module](examples/modules/tasks/README.md).
- **[`add-mcp-tool`](.claude/skills/add-mcp-tool/SKILL.md)** — add one tool to an
  existing module: schema `.describe()`, annotations, `outputSchema`, pagination
  envelope, app-only `*_data` feed (`visibility: "app"`).
- **[`build-mcp-widget`](.claude/skills/build-mcp-widget/SKILL.md)** — build a
  widget against `@miragon/mcp-toolkit-ui`: data contract → primitives →
  host-portable `useHostBridge` → iterate in the playground → verify.
- **[`compose-a-view`](.claude/skills/compose-a-view/SKILL.md)** — compose a
  multi-widget dashboard (eager `buildComposedView`, the default) or chain tool
  outputs through a multi-step pipeline (`render-view`, advanced). The worked
  example is the [`orders` module](examples/modules/orders/README.md).
- **[`white-label-client`](.claude/skills/white-label-client/SKILL.md)** — re-brand
  a client UI with `createTheme` / `ThemeProvider` / `themePresets` and the
  CSS-variable token contract (tokens, never hard-coded colours).

## Testing policy

The repo moves fast. We test only what is supposed to be **stable** — the parts
where silent drift hurts downstream consumers. Use Vitest. Colocate the test
next to the source it covers (`foo.ts` → `foo.test.ts`).

### MUST have tests

- **Zod schemas** exported from any package (`*Schema`, `parse*Env`, `serialize*`).
- **Pure utility functions** (no I/O, no side effects): parsers, normalizers,
  path resolvers, naming helpers, layout transformers.
- **Registry / contract semantics**: collision detection, lookup, filtering.
- **Code generators' naming and output determinism** — the input → output
  mapping is the build-time-↔-runtime contract.
- **Fail-soft boundaries**: a function documented as "logs warning, doesn't
  throw" needs a test proving it doesn't throw on the bad path.

### SHOULD NOT have tests yet

- React rendering and widget glue (UI layer is moving).
- Plugin lifecycle and OAuth state machines (still being shaped — revisit
  once the flow stabilises).
- Middleware internals (better covered by integration tests once the auth
  model is settled).

Loopback smoke tests in `examples/test/` are the exception to none of this:
they are the repo's lightest-weight regression guard (see CONTRIBUTING.md
"Examples-driven development") — every example module ships with one.

### When you change tested code

- Update the test in the same PR. If the contract genuinely changed, replace
  the test with one that pins the new contract — don't delete it to make CI
  green.
- Don't loosen an assertion to dodge a failure. Either the code is wrong, or
  the contract has shifted and the test should describe the new contract.

### When you add a new package or public export

- New schema → new schema test.
- New pure utility → new test.
- Anything else → judgment call, lean toward "not yet".

If you need to test a private helper, **export it** rather than reaching into
the module. An explicit export is a clearer contract than a clever test.
