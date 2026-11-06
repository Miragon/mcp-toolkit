/**
 * The part of an MCP `CallToolResult` the runtime reads. Structural, so the MCP SDK's
 * `CallToolResult` and a widget host's tool result fit as they are.
 */
export interface ToolCallResult {
  content?: readonly unknown[]
  structuredContent?: unknown
  isError?: boolean
}

export interface ToolCallOptions {
  /** Cancels the call; handed through to the transport untouched. */
  signal?: AbortSignal
}

/**
 * Calls a tool by name and resolves with its raw result. Transport-agnostic: an MCP client
 * (`toolCallerFromClient`), a widget host bridge or a test fake. A tool that reports a failure
 * resolves with `isError: true`; a transport or protocol failure rejects.
 */
export type ToolCaller = (
  name: string,
  args: Record<string, unknown>,
  options?: ToolCallOptions,
) => Promise<ToolCallResult>

export interface ToolShape {
  input: unknown
  output: unknown
}

/**
 * Constraint for a tool map, used as `TMap extends ToolMapOf<TMap>`: every entry a
 * {@link ToolShape}, and no index signature. A map with one (`Record<string, ToolShape>`, or an
 * interface extending it, as 2.x generated) has `string` as its key type, so a misspelled tool
 * name would compile; such a map fails the constraint instead.
 */
export type ToolMapOf<TMap> = string extends keyof TMap
  ? never
  : number extends keyof TMap
    ? never
    : { [K in keyof TMap]: ToolShape }

export type ToolName<TMap> = keyof TMap & string

export type ToolInput<
  TMap extends ToolMapOf<TMap>,
  TName extends ToolName<TMap>,
> = TMap[TName]["input"]

export type ToolOutput<
  TMap extends ToolMapOf<TMap>,
  TName extends ToolName<TMap>,
> = TMap[TName]["output"]

/**
 * A tool call typed by a tool map: the name picks the input it takes and the output it resolves
 * with. Pass a literal name: a union of names (`which: "a" | "b"`) types the args as the union of
 * both inputs, so args that fit only one tool compile for either (TypeScript's correlated-union
 * limit). The generated client's methods always pass a literal.
 */
export type TypedCallTool<TMap extends ToolMapOf<TMap>> = <TName extends ToolName<TMap>>(
  name: TName,
  args: ToolInput<TMap, TName>,
  options?: ToolCallOptions,
) => Promise<ToolOutput<TMap, TName>>
