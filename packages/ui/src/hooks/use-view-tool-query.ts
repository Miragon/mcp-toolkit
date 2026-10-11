import { useQuery, type UseQueryResult } from "@tanstack/react-query"
import { useCallTool, useToolNameInQueryKey } from "../providers/query-provider.js"
import { parseViewToolResult } from "../lib/parse-tool-result.js"
import { toolQueryOptions, type UseToolQueryOptions } from "../lib/tool-query.js"
import { useToolKeyGuard } from "./use-tool-query.js"

/**
 * Options of {@link useViewToolQuery}: TanStack's query options, passed
 * through like `useToolQuery`'s (`enabled`, `retry`, `staleTime`,
 * `placeholderData`, `initialData`, …).
 */
export type UseViewToolQueryOptions<T = unknown> = UseToolQueryOptions<T>

/**
 * Self-fetch hook for `*_show_*` widget tools — the envelope-unwrapping sibling
 * of {@link useToolQuery}. A widget tool's text channel carries only a model
 * summary and its `structuredContent` is the full view envelope, so decoding
 * with the plain {@link parseToolResult} would hand the widget the whole
 * envelope; this hook decodes via {@link parseViewToolResult} (single-step →
 * flat data, multi-step → keyed by step id) instead.
 *
 * Same key and options contract as {@link useToolQuery}: the effective key is
 * `[...queryKey, args]` (`[...queryKey, toolName, args]` under an
 * `AppQueryProvider` with `toolNameInQueryKey`), so sibling widgets sharing a
 * query key and args collapse to a single deduped tool call.
 */
export function useViewToolQuery<T = unknown>(
  queryKey: readonly unknown[],
  toolName: string,
  args: object,
  opts?: UseViewToolQueryOptions<T>,
): UseQueryResult<T, Error> {
  const callTool = useCallTool()
  const toolNameInKey = useToolNameInQueryKey()
  useToolKeyGuard(queryKey, toolName, args)
  return useQuery<T, Error>(
    toolQueryOptions<T>(queryKey, toolName, args, callTool, opts, {
      decode: parseViewToolResult,
      toolNameInKey,
    }),
  )
}
