import { textBlocks } from "./text-content.js"
import type { ToolCallResult } from "./types.js"

/**
 * Brands a ToolCallError for `isToolCallError`, which has to hold across copies of this package
 * (two versions in one bundle, another realm), where `instanceof` fails. The registry key is a
 * contract between versions: never change it.
 */
const TOOL_CALL_ERROR = Symbol.for("@miragon/mcp-toolkit-tool-codegen-core/ToolCallError")

/**
 * The tool ran and reported a failure (`isError: true`). A transport or protocol failure is never
 * a ToolCallError: it rejects with whatever the transport threw.
 */
export class ToolCallError extends Error {
  override readonly name = "ToolCallError"
  readonly toolName: string
  readonly result: ToolCallResult

  /** The message is the result's text content; without any, a generic one naming the tool. */
  constructor(toolName: string, result: ToolCallResult) {
    super(textBlocks(result.content).join("\n").trim() || `Tool "${toolName}" reported an error`)
    this.toolName = toolName
    this.result = result
    Object.defineProperty(this, TOOL_CALL_ERROR, { value: true })
  }
}

/** True for a ToolCallError, also one thrown by another copy of this package. */
export function isToolCallError(error: unknown): error is ToolCallError {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { [TOOL_CALL_ERROR]?: unknown })[TOOL_CALL_ERROR] === true
  )
}
