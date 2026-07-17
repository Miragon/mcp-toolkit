# Using tool-codegen

`@miragon/mcp-toolkit-tool-codegen` generates TypeScript types and React
Query hooks from an MCP server's `tools/list`. Your module's steps and
widgets import from `./generated/`, and the compiler catches tool-name
typos, bad args, and schema drift at build time. The source endpoint can
be any MCP server — your own server's tool surface or an external service
you want a typed client for.

## Install

```sh
pnpm add -D @miragon/mcp-toolkit-tool-codegen
```

The binary is `mcp-tool-codegen`.

## Config

```ts
// codegen.config.ts
import type { CodegenConfig } from "@miragon/mcp-toolkit-tool-codegen"

export default {
  proxyName: "lexoffice",
  upstreamUrl: process.env.LEXOFFICE_CODEGEN_SOURCE_URL!,
  auth: { mode: "bearer", token: process.env.LEXOFFICE_CODEGEN_TOKEN! },
  out: "./src/generated",
  overrides: {
    "lexoffice_retrieve-invoice": { output: "import('./types.js').Invoice" },
  },
} satisfies CodegenConfig
```

Fields:

| Field         | Purpose                                                                                                                            |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `proxyName`   | The namespace prefix for the generated tool names and type names (`<proxyName>_<tool>` / `<ProxyName><Tool>Input`).                |
| `upstreamUrl` | HTTP endpoint of the source MCP server the codegen snapshots.                                                                      |
| `auth`        | `none` / `bearer` / `header`. oauth2 is not supported at build time — see below.                                                   |
| `out`         | Relative or absolute output directory.                                                                                             |
| `overrides`   | Per-tool `input` / `output` literal TS expressions that replace the generated type. Handy when the source omits an `outputSchema`. |

Note the naming contract: the generated runtime names are
`<proxyName>_<sourceToolName>`. Register your server's tools under exactly
those names (the examples' articles module does this via a shared
registration helper) so the generated hooks and `TypedCallTool` calls
resolve at runtime.

## Commands

### `generate`

```sh
pnpm mcp-tool-codegen generate
# defaults to --config ./codegen.config.ts
```

Connects to the source endpoint over streamable HTTP, snapshots `tools/list`, runs
`json-schema-to-typescript` on each input/output schema, renders the two
Handlebars templates, writes `tools.ts` + `hooks.tsx` to `out`.

### `generate --check`

```sh
pnpm mcp-tool-codegen generate --check
```

Regenerates into a temp dir and compares against committed files. Exit
code != 0 if they differ. Perfect CI drift check.

### `inspect`

```sh
pnpm mcp-tool-codegen inspect --upstream https://source.example/mcp --token …
```

Prints a Markdown table — name · description · input keys. Discovery with
no code generated.

Auth flags: `--token <bearer>`, `--header <name> --header-value <value>`,
or none.

## Committing the output

**Commit `tools.ts` and `hooks.tsx`.** New contributors should be able to
typecheck and build without a reachable source endpoint. Regenerate
whenever the source's schema changes; `generate --check` in CI tells you
when.

## oauth2-protected sources

Build-time oauth2 would need a browser. Workaround:

1. Run the user oauth2 flow once in dev (real deployment).
2. Read the resulting access token out of the session (or mint a
   long-lived token server-side).
3. Set `auth: { mode: "bearer", token: … }` in the config for codegen.
4. Regenerate on schema changes.

## Output shape

```ts
// generated/tools.ts
export interface LexofficeRetrieveInvoiceInput {
  invoiceNumber: string
}
export interface LexofficeRetrieveInvoiceOutput {
  /* ... */
}
export interface LexofficeToolMap extends Record<string, ToolShape> {
  "lexoffice_retrieve-invoice": {
    input: LexofficeRetrieveInvoiceInput
    output: LexofficeRetrieveInvoiceOutput
  }
}
export type LexofficeCallTool = TypedCallTool<LexofficeToolMap>
```

```tsx
// generated/hooks.tsx
export function useLexofficeRetrieveInvoice(
  args: LexofficeToolMap["lexoffice_retrieve-invoice"]["input"],
  options?: UseToolQueryOptions<LexofficeToolMap["lexoffice_retrieve-invoice"]["output"]>,
) {
  return useToolQuery(...)
}
```

## Missing `outputSchema`

Many MCP servers only publish `inputSchema`. The generated `output` falls
back to `unknown`. Add an override:

```ts
overrides: {
  "lexoffice_retrieve-invoice": { output: "{ id: string; total: number }" },
}
```

Or point at a manually authored type:

```ts
overrides: {
  "lexoffice_retrieve-invoice": { output: "import('./types.js').Invoice" },
}
```

## Worked example

`examples/modules/articles/` is the end-to-end demo: a self-owned module
whose tools are registered from shared Zod schemas, a standalone
`codegen-source.ts` endpoint the generator snapshots, the committed
`generated/` client, and two typed consumers (a pipeline step and a
widget hook). Run it with:

```sh
pnpm --filter @miragon/mcp-toolkit-examples run dev:codegen-source   # terminal 1
pnpm --filter @miragon/mcp-toolkit-examples run generate:check       # terminal 2
```

## Reference

- CLI → `packages/tool-codegen/src/cli.ts`
- Codegen → `packages/tool-codegen/src/codegen.ts`
- Runtime types → `packages/tool-codegen/src/runtime.ts`
- Templates → `packages/tool-codegen/templates/`
