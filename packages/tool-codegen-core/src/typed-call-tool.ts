import { parseToolResult } from "./parse-tool-result.js"
import type { ToolCaller, ToolMapOf, TypedCallTool } from "./types.js"

/**
 * Types a {@link ToolCaller} by a tool map: each call goes through `callTool` with its name, args
 * and options as given, and its result is decoded by {@link parseToolResult}. A failing caller,
 * also one that throws synchronously, rejects the call.
 */
export function createTypedCallTool<TMap extends ToolMapOf<TMap>>(
  callTool: ToolCaller,
): TypedCallTool<TMap> {
  return async (name, args, options) =>
    // MCP tool arguments are a JSON object (an input schema is `type: "object"`); the map types
    // them per tool, the caller takes the plain record.
    parseToolResult(name, await callTool(name, args as Record<string, unknown>, options))
}
