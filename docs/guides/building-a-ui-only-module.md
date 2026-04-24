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
cd vendor/mcp-toolkit
pnpm --filter @miragon/mcp-toolkit-examples dev:articles-upstream  # term 1
pnpm --filter @miragon/mcp-toolkit-examples dev:host               # term 2
# tools/call render-view with the shape in examples/layouts/articles-layout.yaml
```

## See also

- [Using tool-codegen](using-tool-codegen.md)
- [Typed callTool in steps](typed-call-tool-in-steps.md)
- [Upstream proxies concept](../concepts/upstream-proxies.md) — covers
  the fully upstream-hosted variant.
