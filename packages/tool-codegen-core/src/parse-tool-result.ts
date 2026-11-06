import { textBlocks } from "./text-content.js"
import { ToolCallError } from "./tool-call-error.js"
import type { ToolCallResult } from "./types.js"

export interface ParseToolResultOptions {
  /**
   * How to read the first text block when there is no `structuredContent`: `"json"` (default)
   * yields its JSON value, or the string when it is not JSON; `"raw"` always yields the string.
   * Text that happens to be JSON changes type under `"json"`: `"2.10"` becomes the number `2.1`,
   * `"true"` the boolean, and digits beyond a double's precision are lost.
   */
  text?: "json" | "raw"
}

/**
 * Decodes a tool result into the tool's output:
 *
 * 1. `isError: true` throws a {@link ToolCallError}.
 * 2. `structuredContent`, when present, is the output (also `null`, `0`, `false` or `""`).
 * 3. Otherwise the first text content block: its JSON value, or the raw string when it is not JSON
 *    (always the raw string with `{ text: "raw" }`).
 * 4. No text block: `undefined`.
 *
 * `T` is the caller's claim about the output (the generated tool map), not a runtime validation.
 */
export function parseToolResult<T = unknown>(
  toolName: string,
  result: ToolCallResult,
  options?: ParseToolResultOptions,
): T {
  if (result.isError === true) throw new ToolCallError(toolName, result)
  if (result.structuredContent !== undefined) return result.structuredContent as T
  const decode = options?.text === "raw" ? String : jsonOrText
  const text = textBlocks(result.content)[0]
  return (text === undefined ? undefined : decode(text)) as T
}

function jsonOrText(text: string): unknown {
  try {
    return JSON.parse(text) as unknown
  } catch {
    return text
  }
}
