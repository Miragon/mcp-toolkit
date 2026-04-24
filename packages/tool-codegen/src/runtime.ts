/**
 * Runtime types referenced by codegen output. Kept in their own subpath
 * (`@miragon/mcp-toolkit-tool-codegen/runtime`) so widget bundles and
 * step modules can import the types without pulling in the CLI / codegen
 * dependencies (handlebars, json-schema-to-typescript).
 */

export interface ToolShape {
  input: unknown
  output: unknown
}

/**
 * A typed `callTool` closure bound to a specific upstream-MCP's tool map.
 * The `TMap` type is filled in by the generated `<Proxy>ToolMap` interface;
 * consumers write `TypedCallTool<LexofficeToolMap>` and get auto-completion
 * plus compile-time validation on tool names, args, and results.
 *
 * Surface is deliberately 2-arg — the framework pipeline executor injects
 * the caller's userId behind the scenes so step code stays clean.
 */
export type TypedCallTool<TMap extends Record<string, ToolShape>> = <
  TName extends keyof TMap & string,
>(
  name: TName,
  args: TMap[TName]["input"],
) => Promise<TMap[TName]["output"]>
