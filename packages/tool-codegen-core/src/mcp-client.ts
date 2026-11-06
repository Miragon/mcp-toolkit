import type { ToolCallOptions, ToolCaller, ToolCallResult } from "./types.js"

/**
 * The part of an MCP SDK client `toolCallerFromClient` uses. Structural, so the package needs no
 * SDK dependency: `Client` from `@modelcontextprotocol/client` fits as it is.
 */
export interface McpClientLike {
  callTool(
    params: { name: string; arguments?: Record<string, unknown> },
    options?: ToolCallOptions,
  ): Promise<ToolCallResult>
}

/**
 * A {@link ToolCaller} over an MCP client: `tools/call` with the name and args, and the
 * {@link ToolCallOptions} (signal, timeouts, progress) handed to the client as given.
 */
export function toolCallerFromClient(client: McpClientLike): ToolCaller {
  return (name, args, options) => client.callTool({ name, arguments: args }, options)
}
