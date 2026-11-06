import {
  createTypedCallTool,
  type ToolCallOptions,
  type ToolCaller,
  type ToolInput,
  type ToolMapOf,
  type ToolName,
  type ToolOutput,
} from "@miragon/mcp-toolkit-tool-codegen-core"
import { NoToolCallerError } from "./provider.js"

/** One typed call through the provider's caller; rejects with a NoToolCallerError while it has none. */
export async function callToolTyped<TMap extends ToolMapOf<TMap>, TName extends ToolName<TMap>>(
  callTool: ToolCaller | null,
  name: TName,
  args: ToolInput<TMap, TName>,
  options?: ToolCallOptions,
): Promise<ToolOutput<TMap, TName>> {
  if (callTool === null) throw new NoToolCallerError(name)
  return createTypedCallTool<TMap>(callTool)(name, args, options)
}
