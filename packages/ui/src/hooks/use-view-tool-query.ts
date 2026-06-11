import { useQuery, type UseQueryResult } from "@tanstack/react-query"
import { useCallTool } from "../providers/query-provider.js"
import { parseViewToolResult } from "../lib/parse-tool-result.js"

export interface UseViewToolQueryOptions {
  enabled?: boolean
}

/**
 * Self-fetch hook for `*_show_*` widget tools — the envelope-unwrapping sibling
 * of {@link useToolQuery}. A widget tool's text channel carries only a model
 * summary and its `structuredContent` is the full view envelope, so decoding
 * with the plain {@link parseToolResult} would hand the widget the whole
 * envelope; this hook decodes via {@link parseViewToolResult} (single-step →
 * flat data, multi-step → keyed by step id) instead.
 *
 * `args` is appended to the effective query key — same queryKey-vs-args
 * contract as {@link useToolQuery}, so sibling widgets sharing a query key
 * collapse to a single deduped tool call.
 */
export function useViewToolQuery<T = unknown>(
  queryKey: unknown[],
  toolName: string,
  args: object,
  opts?: UseViewToolQueryOptions,
): UseQueryResult<T, Error> {
  const callTool = useCallTool()

  return useQuery<T, Error>({
    queryKey: [...queryKey, args],
    queryFn: async () => {
      if (!callTool) throw new Error("callTool not available")
      const result = await callTool(toolName, args)
      return parseViewToolResult<T>(result)
    },
    enabled: !!callTool && (opts?.enabled ?? true),
  })
}
