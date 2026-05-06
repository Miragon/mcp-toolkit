# Plan: Upstream-hosted widgets + declarative steps

**Status:** shipped (branch `feat/ui-only-modules`, runnable in
`examples/customers-upstream/`)
**Author:** @dominikhorn + Claude
**Date:** 2026-04-23

> Kept for historical context. For how the feature actually works today
> see [concepts/widgets — upstream-hosted widgets](../concepts/widgets.md#upstream-hosted-widgets),
> [guides/building-a-ui-only-module](../guides/building-a-ui-only-module.md),
> and [`examples/customers-upstream/`](../../examples/customers-upstream/).
> A few reality notes vs the original plan are called out inline below.

## Goal

Let an upstream MCP server ship a complete _module_: widget bundles as MCP
resources + declarative pipeline steps. The host discovers them at boot, no
host-side code changes when a new module is added upstream.

## Non-goals

- **JS code for steps.** Declarative only. Every "step" reduces to a
  `callTool(upstream_tool, mapped_args)`. Sandboxing Node-side TS at runtime is
  not worth the complexity, and the user already ruled it out.
- **Third-party upstreams.** The user confirmed: widgets are always their own
  code. We leave a hook for an allowlist later but do not build it now.
- **Hot reload.** Manifest fetched once at boot. Restart to pick up changes.
- **Runtime TS types.** The upstream describes steps/widgets at runtime; host
  does not gain TS typing for new keys. Existing `tool-codegen` is the typed
  path.

## Current architecture (snapshot)

- Host boot: `packages/core/src/tools/create-framework-app.ts`. Plugins
  (TS modules with `definition`, optional `registerTools`, optional
  `proxyBinding`) are passed in at construction time.
- Plugin loading: `loadApps` in `packages/core/src/registry/app-loader.ts`
  hydrates a `StepRegistry` and `WidgetRegistry` from each plugin's
  `definition`.
- Pipeline execution: step functions are plain JS closures on the host. UI-only
  plugins use `proxyBinding: "<name>"` so `buildProxyAppConfigs` injects a
  typed `callTool` closure bound to the matching upstream proxy.
- Widgets: baked into the app-bundle at build time
  (`examples/app-bundle/main.tsx` statically imports each host-bundled
  component and passes the map to
  `<McpToolkitApp widgets={widgetMap} />` — the toolkit root wraps
  `McpAppView` in `McpUseProvider` for host auto-sizing).
- Manifest: `get-framework-manifest` returns local plugin metadata only.

## Target architecture

Add one convention: an upstream can register itself as a _module provider_ by
exposing an MCP tool `get-module-manifest` and serving widget bundles as
resources.

```ts
// shared schema in @miragon/mcp-toolkit-proxy-contract
interface ModuleManifest {
  moduleId: string // e.g. "items-ui"
  runtime: {
    react: string // semver range, e.g. "^19.0.0"
    // Future: reactDom, reactQuery, toolkitUi versions. All locked to host.
  }
  steps: DeclarativeStep[]
  widgets: RemoteWidget[]
}

interface DeclarativeStep {
  id: string // "items-ui:resolve-item"
  dataType: string // "items-ui:item"
  requires: string[] // ["items-ui:itemId"]
  produces: string[] // ["items-ui:item"]
  tool: string // upstream tool name ("get-item")
  inputMapping: Record<string, string> // { id: "keys.items-ui:itemId" }
  outputMapping: Record<string, string> // { "items-ui:item": "result" }
}

interface RemoteWidget {
  id: string // "items-ui:item-card"
  requires: string[] // ["items-ui:item"]
  bundle: string // "ui://items-ui/widgets/item-card.js"
}
```

### Host side

- **Boot-time discovery.** After `registerUpstreamProxies` runs, for each proxy
  flagged `upstreamModules: true` (new field on `ProxyConfig`), call
  `get-module-manifest` via the already-built `UpstreamProxyPlugin` client.
  Validate with Zod; fail fast on schema errors.
- **Declarative step executor.** A helper
  `buildStepFromDeclaration(decl, callTool): PipelineStepDefinition` returns a
  step whose `execute` reads `ctx.keys` + `ctx.steps`, applies `inputMapping`
  (dot-path lookup), calls `callTool(decl.tool, mappedArgs)`, applies
  `outputMapping` to shape the response into keys, returns the standard step
  result.
- **Registry merge.** Generated steps and widget metadata land in the same
  `StepRegistry` / `WidgetRegistry` as local plugins so `get-framework-manifest`
  / `render-view` keep working unchanged.

### App-bundle side

- **Widget loader.** `McpAppView` accepts a `widgetLoader?: (id, uri) =>
Promise<WidgetComponent>` prop. Inspect `viewData.layout`; for every
  widget-id not already in `widgets`, find the matching
  `RemoteWidget.bundle` URI from the manifest (exposed on
  `viewData.remoteWidgets` by the host), fetch the resource, evaluate as
  ESM, register into a local state map before rendering.
  _Shipped:_ the prop is optional — when omitted, `McpAppView` builds a
  default loader via `createRemoteWidgetLoader` that calls the framework
  tool `read-widget-bundle` through the host bridge. Consumers of
  `<McpToolkitApp widgets={...} />` therefore get upstream-hosted
  widgets with zero extra wiring.
- **Shared React runtime.** Each widget bundle is built with React/ReactDOM
  marked `external`. At runtime the host injects them via import map so
  `import "react"` inside the widget resolves to the host copy. Import-map
  injection happens once in `examples/app-bundle/index.html`.

### Multi-upstream composition

The whole point of upstream-hosted modules: a single view can mix widgets
from N independent upstreams, all rendered in one React tree inside one view
iframe.

```yaml
# Layout referencing three unrelated upstreams
rows:
  - row:
      - widget: "items-ui:item-card" # from upstream A
        span: 6
      - widget: "orders:order-summary" # from upstream B
        span: 6
  - row:
      - widget: "users:avatar-strip" # from upstream C
        span: 12
```

What the host guarantees so this composes cleanly:

- **Namespaced IDs.** Manifest validator rejects widget/step IDs that don't
  start with `<moduleId>:`. Prevents collisions across upstreams.
- **Single shared runtime.** All widgets resolve `import "react"` to the same
  host copy via the import map. No N-copies-of-React problem regardless of how
  many upstreams contribute.
- **Single widget registry.** Discovery merges per-upstream manifests into one
  `WidgetRegistry`. `render-view` doesn't care which upstream owns which
  widget — it resolves by ID.
- **Per-widget routing at load time.** `WidgetRegistry` stores the originating
  `moduleId` alongside each entry. `widgetLoader` uses it to call the right
  upstream proxy when fetching the bundle resource.

### Steps across upstreams

Same namespacing + aggregation rules as widgets, plus three step-specific
concerns:

**Per-step proxy binding.** A declarative step's `tool` field (e.g.
`"get-item"`) is local to the declaring upstream. At registration time the
host wraps the step with the originating module's `callTool` closure — the
same mechanism `proxyBinding: "items"` uses today for UI-only modules. A step
from `items-ui` can _only_ call `items_*` tools. Steps from `orders` can only
call `orders_*` tools. No cross-upstream tool calls from inside a step —
that's a pipeline composition concern, not a step concern.

**Cross-upstream data flow via keys.** Composition across upstreams happens
at the pipeline level through the shared key context:

```
step items-ui:resolve-item    requires ["items-ui:itemId"]
                              produces ["items-ui:item"]
                              → calls items_get-item

step orders:list-for-item     requires ["items-ui:item"]   # ← foreign key
                              produces ["orders:order-list"]
                              → calls orders_list-orders
```

For a step in module B to consume a key produced by module A, B's manifest
declares it via `requires: ["<A's namespace>:<key>"]`. The host's pipeline
resolver (already topologically sorts by requires/produces) handles ordering
regardless of which module emitted which step. **Validation at discovery:**
if a step's `requires` references a namespace that isn't loaded, log a
warning — the step is inert without its producer but doesn't block others.

**Step ID + key namespacing.** Enforced by the manifest validator alongside
the widget ID check. Step IDs, data types, and produced key names all
prefix with `<moduleId>:`. Declarative steps may only `requires` keys that
are either (a) in their own namespace, (b) in another loaded module's
namespace, or (c) standard host keys (namespace `host:`, reserved).

**What this enables.** A host with three upstreams loaded can run a pipeline
like: `users:resolve-user` → `items-ui:resolve-item` → `orders:list-for-item`
— three tools on three servers, one coherent view — without the host
shipping any of the glue code. The glue is the shared key vocabulary,
declared in each upstream's manifest.

**What this does _not_ enable.** A step can't orchestrate multiple upstream
tool calls in one execution. If you need that, either (a) add a local host
step that composes via `callTool` closures, or (b) add a bespoke orchestrator
tool on one of the upstreams. Declarative stays declarative: one step = one
upstream tool call.

### React version lock

Cross-upstream composition only works if every upstream builds against the
same React major as the host. Mismatch = hooks crash, silent data corruption,
or white screen.

Enforcement:

- **At discovery** (host boot): parse each manifest's `runtime.react` range,
  compare against the host's React major. On mismatch: log error, skip the
  upstream's modules, keep the host booting with a degraded set. The host's
  React major is exported as a constant from `@miragon/mcp-toolkit-ui` so the
  host derives it directly rather than hand-declaring.
- **At widget load** (runtime assert): `remote-widget-loader` asserts
  `React.version` inside the just-loaded bundle matches the expected major
  before handing the component to `WidgetRenderer`. Belt + suspenders — catches
  bundles that were built against a different React than their manifest
  claims.
- **Documented**: the upstream-hosted widget contract lives in
  [concepts/widgets](../concepts/widgets.md#upstream-hosted-widgets) and
  [guides/building-a-ui-only-module](../guides/building-a-ui-only-module.md).
  Module authors externalise React using the toolkit's shared Vite
  preset (see Phase 4).

### Example rewrite

_Shipped:_ the final layout landed as two upstreams split by concern,
not one. Reality notes below.

- `examples/customers-upstream/server.ts`: registers `get-customer`,
  `get-module-manifest`, and the widget bundle as MCP resource
  `ui://customers/customer-card.js`. Exercises the upstream-hosted path.
- `examples/customers-upstream/widget/CustomerCard.tsx`: built by Vite
  with `react` + `react/jsx-runtime` externalised.
- `examples/articles-upstream/server.ts`: plain external MCP (no
  manifest). Pairs with `examples/modules/articles/` (host-bundled UI
  via codegen) to keep the host-bundled path exercised.
- `examples/host/index.ts`: imports only the host-bundled `articles`
  plugin. The `customers` proxy config sets `upstreamModules: true`, so
  `createFrameworkApp` synthesises its `AppPlugin` from the manifest.
- `examples/app-bundle/main.tsx`: mounts `<McpToolkitApp>` with a single
  host-bundled widget (the map `{ "articles:article-card": ArticleCard }`)
  — relies on the default widget loader for upstream-hosted widgets, so
  no explicit `widgetLoader` wiring appears in consumer code.

## Phases

### Phase 1 — Manifest contract (1 PR)

- Add `ModuleManifestSchema`, `DeclarativeStepSchema`, `RemoteWidgetSchema`,
  `RuntimeRequirementSchema` to `packages/proxy-contract/src`.
- Add `upstreamModules?: boolean` to `ProxyConfigSchema`.
- Export `TOOLKIT_REACT_MAJOR` constant from `@miragon/mcp-toolkit-ui` so host
  - module authors share one source of truth.
- No runtime behaviour changes yet; pure schema + types.
- **Exit criteria:** schemas exported, typecheck green, one zod test round-trip
  including `runtime.react` parsing.

### Phase 2 — Host discovery + declarative step executor (1 PR)

- `packages/core/src/module-loader/discover.ts`: iterate proxies with
  `upstreamModules: true`, call `get-module-manifest`, validate, check
  `runtime.react` range against `TOOLKIT_REACT_MAJOR`, return
  `DiscoveredModule[]`. On version mismatch: log error, skip module, continue
  with other upstreams (fail-soft per open question 4).
- Namespace validator: reject manifests whose widget/step IDs, step
  `dataType`, or `produces` keys don't prefix with `<moduleId>:`. Hard fail —
  bad manifest is a bug, not a config issue.
- Cross-namespace `requires` warning: if a step requires a key from another
  module's namespace that isn't loaded, log + leave the step registered but
  inert (won't execute because the producer never runs). Keeps degraded-mode
  booting possible.
- `packages/core/src/pipeline/declarative-step.ts`:
  `buildStepFromDeclaration(decl, callTool)` binds each declarative step at
  registration time to its originating module's `callTool` closure — same
  proxy-binding mechanism already used for UI-only plugins. Plus a
  `dotPath(obj, path)` helper. Unit tests covering: missing input key,
  upstream error, output remapping, cross-namespace `requires` (key from
  another upstream resolves through the shared pipeline context).
- `createFrameworkApp`: after proxy registration, run discovery, register
  generated steps into `stepRegistry`, register widget metadata into
  `widgetRegistry`.
- Extend `get-framework-manifest` output to flag which steps/widgets are
  remote (for debugging).
- **Exit criteria:** adding a mock upstream with `get-module-manifest` causes
  `render-view` to successfully run its declarative step via curl — no browser
  yet, no widget rendering yet.

### Phase 3 — Remote widget loading (1 PR)

- `packages/ui/src/app/mcp-app-view.tsx`: accept `widgetLoader`. In a
  `useEffect`, compute the union of widget-ids referenced by the current
  layout, for each unknown id await loader, merge into a local widget map
  passed to `WidgetRenderer`. Loading state UI.
- `packages/ui/src/app/remote-widget-loader.ts`: helper that reads an MCP
  resource via `callTool`/`useWidget` transport, decodes to text, wraps in
  `URL.createObjectURL(new Blob([src], {type: "text/javascript"}))`, dynamic
  `import()`s it. After import, asserts the loaded module's `React.version`
  (via a tiny `__runtime` export convention or direct `React.version` read
  through the import-map-resolved singleton) matches
  `TOOLKIT_REACT_MAJOR`. On mismatch: throw, `WidgetRenderer` displays an
  error state for that cell rather than silently crashing hooks. Returns
  `.default`.
- `examples/app-bundle/index.html`: add import map for `react` and `react-dom`
  pointing at host-served copies (or at the bundled IIFE that exposes them on
  `window`).
- **Exit criteria:** with a prebuilt widget JS file served as an MCP resource,
  the Inspector renders it when layout references its id. No example
  refactor yet — can use a hand-crafted resource.

### Phase 4 — Example refactor + docs (1 PR)

- Move `examples/modules/items-ui/widgets/ItemCard.tsx` → a standalone
  build target in the upstream-mock workspace. Vite lib mode, externalize
  React + react-dom + react/jsx-runtime + @tanstack/react-query + mcp-use/react
  - @miragon/mcp-toolkit-ui.
- Ship `@miragon/mcp-toolkit-module-preset` with a ready-to-import Vite
  config helper: `defineModuleBuild({ entry })`. Module authors write three
  lines, get the correct `external` list + output format.
- Host serves runtime shims under `/runtime/*.js` that re-export the host's
  copies of each shared lib; `index.html` import map points at them.
- `examples/upstream-mock/server.ts` serves both the manifest and the widget
  JS.
- Drop `resolve-item.ts`, delete `items-ui` plugin from `examples/host`.
- New doc `docs/guides/upstream-hosted-modules.md` covering end-to-end setup.
- Update `docs/concepts/architecture.md` diagram.
- **Exit criteria:** `examples/host/index.ts` no longer imports anything
  items-related. Inspector end-to-end still renders the item card via
  render-view.

## Open questions

1. **Widget CSS.** Tailwind classes used inside a remote widget must be in the
   host's compiled CSS. Two options: (a) document a shared Tailwind preset the
   module author includes so their source paths get scanned at host build
   time; (b) ship per-widget CSS alongside the JS and inject on load. Preferred:
   (a) for v1, (b) later if needed.
2. **React singleton enforcement.** Import map vs. global. Import map is
   cleaner but requires iframe `srcdoc` support — confirm Inspector's iframe
   honors `<script type="importmap">` (Chromium/Firefox yes, Safari 16.4+).
   If not, fall back to `window.__mcpRuntime = { React, ReactDOM, ... }` +
   Vite externals rewrite that resolves bare specifiers against the global.
   The shared preset from Phase 4 should emit whichever form the host
   declares it supports.
3. **Resource fetch path.** `mcp-use`'s resource API over streamable HTTP vs.
   direct fetch of `/mcp/resource/<uri>`. Prefer the SDK path so auth headers
   flow through the same transport.
4. **Error surface.** If discovery fails for one upstream, do we boot with
   warnings or fail hard? Propose: warn + skip that upstream's modules, keep
   the rest.
5. **Bundle hash / cache-busting.** Include a content hash in the `bundle` URI
   so stale widgets aren't cached across upstream deploys.

## Risks

- **React runtime duplication.** If externalization breaks, two React copies
  mount and hooks crash. Mitigated by two independent checks: (1) discovery
  rejects manifests whose `runtime.react` range doesn't satisfy the host's
  major; (2) `remote-widget-loader` asserts `React.version` at load time.
  Failure surfaces as a visible per-widget error, not a silent crash.
- **Version drift across upstreams.** Upstream A pins React 19, upstream B
  ships React 20 before the host upgrades. Host refuses B's modules until the
  host itself is upgraded. Acceptable — keeps the host-as-conductor invariant.
- **Import map support in iframe srcdoc.** Chromium/Firefox support it, but
  `srcdoc` sandboxes can be finicky. Fallback plan: the host app-bundle
  exposes `window.__mcpRuntime = { React, ReactDOM }` and widget bundles use
  a tiny shim.
- **Manifest drift.** Host caches manifest at boot; a deploy of the upstream
  that changes widget ids won't take effect until host restart. Acceptable
  for now; document it.

## Success criteria

_Shipped equivalents — the concrete module names diverged from the
original plan (`items-ui` / `hello`) during implementation._

- `examples/host/index.ts` contains only the host-bundled `articles`
  plugin; `customers` is fully upstream-driven (manifest-discovered
  step, upstream-served widget bundle).
- `render-view` with a `customers:customer-card` layout renders the
  card, driven by a declarative step and a remotely loaded widget
  bundle.
- CI green, Inspector screenshot captured in the PR.
- Docs updated.

## Rough sizing

- Phase 1: ~120 LoC, 0.5 day
- Phase 2: ~450 LoC + tests (incl. version check + namespace validator), 1.5 days
- Phase 3: ~350 LoC + integration test (incl. runtime React assert), 1.5 days
- Phase 4: example rewrite + shared module preset + docs, 1.5 days
- **Total: ~5 days**, each phase independently mergeable.
