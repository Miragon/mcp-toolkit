/**
 * The part of an MCP `CallToolResult` the runtime reads. Structural, so the MCP SDK's
 * `CallToolResult` and a widget host's tool result fit as they are.
 */
export interface ToolCallResult {
  content?: readonly unknown[]
  structuredContent?: unknown
  isError?: boolean
}

/** One progress notification of a running call: the MCP SDK's `Progress`. */
export interface ToolCallProgress {
  /** The progress so far; grows with every notification, also when the total is unknown. */
  progress: number
  /** The total the progress counts towards, when the server knows it. */
  total?: number
  /** What the tool is doing, when the server says. */
  message?: string
}

/**
 * Per-call options, handed to the {@link ToolCaller} untouched. The names and meanings are the MCP
 * SDK client's `RequestOptions`, so `toolCallerFromClient` passes them on as they are; another
 * caller (a widget host bridge, a test fake) honours what it supports.
 */
export interface ToolCallOptions {
  /** Cancels the call. */
  signal?: AbortSignal
  /** Milliseconds to wait for the result before the call fails. The MCP SDK's default: 60,000. */
  timeout?: number
  /**
   * Receives the server's progress notifications for this call. Setting it asks the server for
   * them; a server that sends none never calls it.
   */
  onprogress?: (progress: ToolCallProgress) => void
  /**
   * Starts the `timeout` again with every progress notification. Default `false`. Needs
   * `onprogress`: a server sends progress only for a call that asks for it.
   */
  resetTimeoutOnProgress?: boolean
  /**
   * Milliseconds the call may take in all, progress notifications or not. Default: no limit
   * beyond `timeout`.
   */
  maxTotalTimeout?: number
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
