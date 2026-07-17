# Building a UI-only module

Use this when an external MCP server already exists and you want to add
typed widgets + pipeline steps on top of it — without re-implementing its
tools.

Two shapes are supported:

1. **Host-bundled UI** — the plugin and widgets live in the host repo;
   only the tools are upstream. Typed via codegen. This guide walks
   through that path, mirroring
   [`examples/modules/articles/`](../../examples/modules/articles/).
2. **Fully upstream-hosted** — the upstream also ships the declarative
   step and the widget bundle. The host discovers them at boot via
   `get-module-manifest` and fetches the widget JS at render time via
   `read-widget-bundle`. No host-side plugin file. See
   [`examples/customers-upstream/`](../../examples/customers-upstream/)
   and the [Upstream proxies concept](../concepts/upstream-proxies.md).

The rest of this guide covers shape 1.

## Prerequisites

- An `UpstreamProxyPlugin` registered for the upstream (either directly
  or via `MCP_PROXIES`).
- `@miragon/mcp-toolkit-tool-codegen` installed for build-time types.

## Layout

```
modules/articles/
├── definition.ts       AppDefinition: name, steps, widgets
├── plugin.ts           createPlugin() → { definition, proxyBinding }
├── steps/*.ts          typed steps using <TypedCallTool>
├── widgets/*.tsx       React components using generated hooks
├── generated/          codegen output — committed
│   ├── tools.ts
│   └── hooks.tsx
├── codegen.config.ts
└── package.json
```

Runnable version: [`examples/modules/articles/`](../../examples/modules/articles/).

## Generate the types

```ts
// codegen.config.ts
import type { CodegenConfig } from "@miragon/mcp-toolkit-tool-codegen"

export default {
  proxyName: "articles",
  upstreamUrl: process.env.UPSTREAM_ARTICLES_URL ?? "http://localhost:4000/mcp",
  auth: { mode: "none" },
  out: "./generated",
} satisfies CodegenConfig
```

```sh
pnpm mcp-tool-codegen generate
```

Outputs `tools.ts` (typed `<Proxy>ToolMap`, `<Proxy>CallTool`) and
`hooks.tsx` (typed React Query hooks like `useArticlesGetArticle`).
Commit both so contributors don't need the upstream reachable just to
compile.

## Plugin

```ts
// plugin.ts
import type { AppPlugin } from "@miragon/mcp-toolkit-core"
import { definition } from "./definition.js"

export function createPlugin(): AppPlugin {
  return {
    definition,
    proxyBinding: "articles", // must match the proxy `name` in MCP_PROXIES
  }
}
```

No `registerTools`. The proxy already federates the upstream's tools; the
`proxyBinding` tells `buildProxyAppConfigs` to inject a typed `callTool`
into this plugin's `appConfig` at boot.

## Step using the typed `callTool`

```ts
// steps/resolve-article.ts
import type { PipelineStepDefinition } from "@miragon/mcp-toolkit-core"
import type { ArticlesCallTool } from "../generated/tools.js"

export const resolveArticleStep: PipelineStepDefinition<{ callTool: ArticlesCallTool }> = {
  id: "articles:resolve-article",
  dataType: "articles:article",
  requires: ["articles:articleId"],
  produces: ["articles:article"],
  async execute(ctx, { callTool }) {
    const id = String(ctx.keys["articles:articleId"])
    const article = await callTool("articles_get-article", { id })
    return {
      _app: "articles",
      _step: "resolve-article",
      data: article,
      keys: { "articles:article": article },
    }
  },
}
```

Full auto-completion on tool name, args, and return type.

## Widget using the typed hook

```tsx
// widgets/ArticleCard.tsx
import type { WidgetProps } from "@miragon/mcp-toolkit-core"
import { useArticlesGetArticle } from "../generated/hooks.js"

export function ArticleCard({ keys }: WidgetProps) {
  const id = String(keys["articles:articleId"] ?? "")
  const { data, isLoading } = useArticlesGetArticle({ id }, { enabled: !!id })
  if (isLoading) return <p>Loading…</p>
  if (!data) return null
  return (
    <div>
      <strong>{data.title}</strong>
      <div>by {data.author}</div>
    </div>
  )
}
```

## Register

```ts
import { createPlugin as createArticlesPlugin } from "./modules/articles/plugin.js"

await createFrameworkApp({
  ...,
  plugins: [createArticlesPlugin()],
  proxies: parseProxyConfigEnv(process.env.MCP_PROXIES), // must include "articles"
  ...
})
```

## Verify end-to-end

```sh
# from the repository root
pnpm --filter @miragon/mcp-toolkit-examples dev:articles-upstream  # term 1
pnpm --filter @miragon/mcp-toolkit-examples dev:host               # term 2
# tools/call render-view with the shape in examples/layouts/articles-layout.yaml
```

The two sections below apply to shape 2 (the fully upstream-hosted module).

## Reusing a host widget (`hostWidget` references)

If the host already bundles a widget that fits your data, the manifest can
contribute an **alias** instead of shipping a bundle. A `hostWidget` entry
(requires `schemaVersion: 2`) maps your module-namespaced widget id onto a
host-registered widget id, optionally with preset props:

```ts
const manifest: ModuleManifest = {
  schemaVersion: 2, // mandatory once the manifest uses hostWidget entries
  moduleId: "customers",
  runtime: { react: "^19.0.0" },
  steps: [/* … */],
  widgets: [
    {
      id: "customers:orders-kpi", // your namespace, like any widget id
      requires: [],
      hostWidget: "orders:kpi", // the HOST's widget id — foreign namespace expected
      props: { source: "customers module" }, // presets, merged under cell props
      size: "half",
    },
  ],
}
```

Rules:

- **Props precedence — the cell wins.** The entry's `props` are merged
  _under_ each layout cell's own `props`, key by key. A cell that sets
  `props: { source: "override" }` overrides the preset's `source` while
  keeping the other preset keys.
- **Target rules.** `hostWidget` must name a widget the host bundles itself
  (a _local_ widget). An unregistered target — or one that is upstream-hosted
  or itself an alias — makes the host skip your whole module at boot
  (fail-soft, logged warning). Coordinate the id with the host operator; it is
  deliberately not namespace-checked against your module.
- **Rendering.** `render-view` advertises layout-referenced aliases under
  `structuredContent.aliasWidgets`; the shell resolves them against its own
  bundled widget map — no fetch, no extra bundle.

Runnable example: the `customers:orders-kpi` entry in
[`examples/customers-upstream/server.ts`](../../examples/customers-upstream/server.ts).

## Interactive widgets with shared runtimes

A remote widget that only renders pushed data needs nothing beyond React. To
make it _interactive_ — calling tools via `useCallTool`, using `useToolQuery`
or the toolkit-ui primitives — the bundle must share the **host's** module
instances (React context identity), which takes one declaration on each side:

1. **Externalise everything shared** in the widget's Vite build:

   ```ts
   rollupOptions: {
     external: [
       "react", "react/jsx-runtime", "react-dom", "react-dom/client",
       "mcp-use/react",
       "@miragon/mcp-toolkit-ui",
       "@miragon/mcp-toolkit-ui/app",
       "@miragon/mcp-toolkit-ui/hooks",
       "@tanstack/react-query",
     ],
   }
   ```

2. **Declare what you import** in the manifest's `runtime` block — and bump to
   `schemaVersion: 2`:

   ```ts
   runtime: { react: "^19.0.0", toolkitUi: "0.9.0" }, // + mcpUseReact / reactQuery as used
   ```

   Pin the toolkit version you built against. 0.x ranges match on major
   **and** minor (the 0.x breaking axis); majors >= 1 match on major only. A
   host that doesn't expose a runtime you declare skips your module fail-soft
   at discovery — which beats the alternative: an _undeclared_ import dies at
   bundle-evaluation time in the browser.

3. The host, for its part, exposes the runtimes (`exposeSharedRuntime` +
   `buildSharedRuntimeImportMap` in its app-bundle) and declares them via
   `createFrameworkApp`'s `hostRuntime` option. See
   [widgets — shared runtimes](../concepts/widgets.md#shared-runtimes-and-interactive-remote-widgets).

CSS caveat: toolkit-ui primitives depend on the host page's compiled Tailwind.
Utility classes the host's own widgets never emit are missing from the host's
CSS, so a remote widget's Tailwind styling is only as complete as the host's
class set — prefer inline styles or the primitives the host demonstrably uses.

Runnable example: the refresh button in
[`examples/customers-upstream/widget/CustomerCard.tsx`](../../examples/customers-upstream/widget/CustomerCard.tsx)
calls the federated `customers_get-customer` tool through `useCallTool`.

## See also

- [Using tool-codegen](using-tool-codegen.md)
- [Typed callTool in steps](typed-call-tool-in-steps.md)
- [Upstream proxies concept](../concepts/upstream-proxies.md) — covers
  the fully upstream-hosted variant.
