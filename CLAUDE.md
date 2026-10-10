# CLAUDE.md — `mcp-toolkit`

Project-specific guidance for AI agents and humans working in this repo.

## Design-System (verbindlich)

Alle UI- und Gestaltungsarbeit folgt dem Miragon-Design-System für Produkte. Quelle der
Wahrheit ist die Skill `miragon-brand:modeler-tool-design` im Repo Miragon/corporate-identity.
Sie lädt automatisch bei UI-Arbeit, wenn das Plugin installiert ist. Ohne Plugin den Guide direkt lesen:
https://raw.githubusercontent.com/Miragon/corporate-identity/main/plugins/miragon-brand/skills/modeler-tool-design/assets/modeler-design-system.md
Die Marken-Tokens kommen aus der Skill (`cd-tokens.generated.css`). Keine HEX-Werte forken.
UI-Texte sind Deutsch, mit du-Ansprache.

How this repo applies it (the deviations for embedded chat widgets are decided and
recorded in Miragon/miragon-ai's CLAUDE.md; don't undo them here):

- **Miragon is the toolkit's default theme.** `packages/ui/src/theme/cd-tokens.generated.css`
  is the skill's file, vendored unchanged below a marker line (re-copy it, never edit it;
  `cd-tokens.test.ts` pins it byte for byte and against the TS mirror `CD_TOKENS`).
  `packages/ui/src/theme.css` maps the role tokens onto `--cd-*`, light AND dark.
- **Widgets follow the host theme** (`.dark` or `data-theme="dark"`), so there IS a dark
  layer, built strictly from the CI dark-ground rules: `--cd-schwarz` ground with small
  white lifts, white text, links `--cd-gruen`, buttons `--cd-blau` with white, focus
  `--cd-blau-hell`, status in the `-hell` values without tinted fills, quiet text
  `--cd-kontur`. No in-app theme switch. Diagram paper and its zoom chrome stay light
  (`data-theme-mode="light"` marks such an island).
- **UI texts follow the host locale (en/de).** German follows `brand-tone` fully; English
  takes the transferable rules (sentence case, active voice, no em-dash connectors).
- **Fonts:** the tokens name Geist / Geist Mono first; loading them is opt-in
  (`@miragon/mcp-toolkit-ui/fonts.css` or `fontFaces({ baseUrl })`).

**The role-token contract.** Every component, in this repo and in apps built on it,
styles through these CSS variables (Tailwind utilities of the same name), never through
raw colours or Tailwind palette classes:

`--background --card --popover --muted --secondary --foreground --muted-foreground
--border --input --primary --primary-foreground --primary-hover --link --ring --focus
--success --warning --danger --info --success-soft --warning-soft --danger-soft
--info-soft --success-ink --warning-ink --danger-ink --info-ink --destructive
--radius-sm --radius-md --radius-lg --radius-pill --shadow-1 --shadow-2 --shadow-3
--scrim --motion-fast --motion-base --motion-slow --ease --font-sans --font-mono`

(`ROLE_TOKENS` in `packages/ui/src/theme/create-theme.ts`.) The tone model has three
roles per tone: the colour (`--<tone>`: fill, dot, border, icon), the tint
(`--<tone>-soft`) and the TEXT colour (`--<tone>-ink`). Status is never text in its own
colour: success and warning reach only 1.67:1 / 1.83:1 on white; use the `TONE_*` maps
in `lib/tone-utils.ts`, `text-link` for links (never `text-primary`) and `FOCUS_RING`
for focus.

**How a consumer brands it.** Override ONLY role variables (in CSS after the toolkit
import, or with `createTheme` + `ThemeProvider`), never `--cd-*` and never a component
class. A brand needs no toolkit release. A host may set only the neutral roles
(background, card, foreground, muted, border); primary, link, focus, the status tones and
the input border stay brand decisions. Every new pair a component renders goes into the
contrast test (`theme-css.test.ts`, text ≥ 4.5:1, non-text ≥ 3:1, both modes).

**Gates:** `examples/test/design-system.test.ts` (no palette utilities, no raw colours
outside the theme files, no status/primary/destructive as text, no translucent text),
`packages/ui/src/theme/{cd-tokens,theme-css}.test.ts` (drift, contract, contrast).
`.miragon/brand.json` switches the brand-lint hook on for this repo.

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

We test what is supposed to be **stable** — the parts where silent drift hurts
downstream consumers. Use Vitest. Colocate the test next to the source it
covers (`foo.ts` → `foo.test.ts`). Machine-enforced gates for this policy live
in [`FITNESS.md`](FITNESS.md).

### MUST have tests

- **Zod schemas** exported from any package (`*Schema`, `parse*Env`, `serialize*`).
- **Pure utility functions** (no I/O, no side effects): parsers, normalizers,
  path resolvers, naming helpers, layout transformers.
- **Registry / contract semantics**: collision detection, lookup, filtering.
- **Code generators' naming and output determinism** — the input → output
  mapping is the build-time-↔-runtime contract.
- **Fail-soft boundaries**: a function documented as "logs warning, doesn't
  throw" needs a test proving it doesn't throw on the bad path.
- **Every externally consumed surface is frozen by a golden**: the tools/list
  wire shape (descriptions, annotations, schema texts, `_meta`), the
  `get-framework-manifest` payload, each package's runtime export surface,
  and the ui catalog (both directions). Goldens change ONLY via
  `GOLDEN_UPDATE=1` locally + a committed, reviewed JSON diff — never by
  hand-editing (`examples/test/golden/`, `examples/test/helpers/golden.ts`).
- **Every example module ships a loopback smoke test** in `examples/test/`
  (CONTRIBUTING.md: "the lightest-weight regression guard the toolkit has").
- **Security / fail-soft middleware boundaries** get error-path tests
  (org-gate is the reference case, phase 5b).

### Deliberate non-goals (recorded renunciations, each with a revisit trigger)

- **DOM/interaction tests (jsdom/@testing-library)** — SSR via
  `renderToStaticMarkup` is the house path; the render-coverage ratchet
  (phase 5c) is the compensating control, and the mutation score explicitly
  does NOT measure this surface. Revisit when the builder API is declared
  stable.
- **Browser E2E against ChatGPT/mcp-use hosts** — host UIs are external; the
  wire goldens + host-bridge unit tests are the boundary. Revisit if a host
  regression escapes them.
- **OAuth flows against a real IdP** — covered by the middleware error-path
  tests plus a fake-provider contract over loopback
  (`packages/core/src/tools/create-framework-app.auth.test.ts`: a real
  `MCPServer` with `oauthCustomProvider`, driving the role filter, org gate,
  dashboard isolation and pipeline caller over HTTP). Token issuance, JWKS
  and refresh against a real IdP stay out. Revisit when the auth model
  settles.
- **Builder React components** (Workspace, PipelineStrip, CatalogueSheet, …)
  — only their extracted pure parts (builder-model, builder-reducer) are
  MUST-tested. Same revisit trigger as jsdom.

### When you change tested code

- Update the test in the same PR. If the contract genuinely changed, replace
  the test with one that pins the new contract — don't delete it to make CI
  green (enforced: `scripts/check-test-erosion.mjs`).
- Don't loosen an assertion to dodge a failure. Either the code is wrong, or
  the contract has shifted and the test should describe the new contract.
  Focused/disabled tests and constant assertions are lint errors; an
  `eslint-disable` inside a test needs a written reason.

### When you add a new package or public export

- New schema → new schema test.
- New pure utility → new test.
- New runtime export → the export-surface golden fails until you update it;
  add the docs row (`docs/reference/api-*.md`) in the same PR.

If you need to test a private helper, **export it** rather than reaching into
the module. An explicit export is a clearer contract than a clever test.
