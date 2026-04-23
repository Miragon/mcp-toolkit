# `@miragon/mcp-toolkit-tool-codegen` — API reference

Two subpath exports + a CLI.

## `@miragon/mcp-toolkit-tool-codegen` (main)

Programmatic API for the codegen. All exports are side-effect-free — safe
to import from build scripts.

### Types

| Symbol                   | Shape                                                         |
| ------------------------ | ------------------------------------------------------------- |
| `CodegenConfig`          | `{ proxyName, upstreamUrl, auth?, out, overrides? }`.         |
| `CodegenResult`          | `{ toolsFile, hooksFile, tools }`.                            |
| `FetchToolsOptions`      | `{ upstreamUrl, auth?, headers? }`.                           |
| `UpstreamToolDescriptor` | `{ name, description?, title?, inputSchema, outputSchema? }`. |

`auth` in both types is `{ mode: "none" } \| { mode: "bearer", token } \| { mode: "header", headerName, value }`. oauth2 is not supported at build time.

`overrides` in `CodegenConfig` maps full tool names (`<proxy>_<tool>`) to
literal TypeScript type expressions that replace the generated `input` /
`output` bodies — the escape hatch for MCPs that omit `outputSchema`.

### Functions

| Symbol               | Signature                                                                                                                    |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `fetchUpstreamTools` | `(opts: FetchToolsOptions) → Promise<UpstreamToolDescriptor[]>`. Opens a streamable-HTTP client, calls `tools/list`, closes. |
| `generateTools`      | `(config: CodegenConfig) → Promise<CodegenResult>`. Fetches upstream + compiles JSON-schemas + renders Handlebars templates. |
| `writeCodegenOutput` | `(config, result) → Promise<void>`. Resolves `config.out` vs `cwd`, `mkdir -p`, writes `tools.ts` + `hooks.tsx`.             |

## `@miragon/mcp-toolkit-tool-codegen/runtime`

Runtime types referenced by generated code. Separate subpath so widget
bundles don't pull in `handlebars` / `json-schema-to-typescript`.

| Symbol                                                  | Signature                                                                                                         |
| ------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `ToolShape`                                             | `{ input: unknown, output: unknown }`.                                                                            |
| `TypedCallTool<TMap extends Record<string, ToolShape>>` | `<TName extends keyof TMap & string>(name: TName, args: TMap[TName]["input"]) => Promise<TMap[TName]["output"]>`. |

Generated code imports only these — consumers never need to reach into
the `main` entry at runtime.

## `buildProxyAppConfigs` — note

Despite being mentioned in codegen discussions, `buildProxyAppConfigs` is
exported from **`@miragon/mcp-toolkit-core`** (and `…-core/proxy`), not
from this package. See the core reference.

## CLI — `mcp-tool-codegen`

Installed as `packages/tool-codegen/bin/mcp-tool-codegen` when the package
is linked/installed.

### `generate`

```
mcp-tool-codegen generate [--config <path>] [--check]
```

Reads `./codegen.config.ts` (or `--config <path>`). The config's default
export must satisfy `CodegenConfig`. Writes `tools.ts` + `hooks.tsx` into
`config.out`.

`--check` — regenerates into a temp dir and exits 1 if either file
differs from the committed output. Use in CI to catch upstream drift.

### `inspect`

```
mcp-tool-codegen inspect --upstream <url>
                        [--token <bearer>]
                        [--header <name> --header-value <v>]
```

Prints a markdown table of every tool (name · description · input keys).
Discovery only — no files written.

### Auth flag resolution

- `--token <x>` → `{ mode: "bearer", token: x }`
- `--header X --header-value Y` → `{ mode: "header", headerName: "X", value: "Y" }`
- neither → `{ mode: "none" }`

For `generate`, prefer `codegen.config.ts` — env-driven config is
reproducible, flag-driven config is for interactive debugging.

## Example `codegen.config.ts`

```ts
import type { CodegenConfig } from "@miragon/mcp-toolkit-tool-codegen"

export default {
  proxyName: "lexoffice",
  upstreamUrl: process.env.LEXOFFICE_UPSTREAM_URL!,
  auth: { mode: "bearer", token: process.env.MCP_PROXY_LEXOFFICE_TOKEN! },
  out: "./src/generated",
  overrides: {
    "lexoffice_retrieve-invoice": {
      // upstream omits outputSchema → pin the shape by hand
      output: `{ id: string; amount: number; status: "paid" | "open" | "overdue" }`,
    },
  },
} satisfies CodegenConfig
```

## Generated output shape

```ts
// generated/tools.ts
export interface LexofficeToolMap {
  "lexoffice_retrieve-invoice": {
    input: LexofficeRetrieveInvoiceInput
    output: LexofficeRetrieveInvoiceOutput
  }
  // …
}
export type LexofficeToolName = keyof LexofficeToolMap & string
export type LexofficeCallTool = TypedCallTool<LexofficeToolMap>
```

```tsx
// generated/hooks.tsx
export function useLexofficeRetrieveInvoice(
  args: LexofficeToolMap["lexoffice_retrieve-invoice"]["input"],
  options?: UseToolQueryOptions<LexofficeToolMap["lexoffice_retrieve-invoice"]["output"]>,
) {
  /* useToolQuery wrapper */
}
```

One hook per upstream tool. Query key: `[proxyName, toolName]`.

## See also

- [Using tool-codegen](../guides/using-tool-codegen.md)
- [Typed call-tool in steps](../guides/typed-call-tool-in-steps.md)
- [Building a UI-only module](../guides/building-a-ui-only-module.md)
