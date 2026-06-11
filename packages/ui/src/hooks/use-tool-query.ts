import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { useCallTool } from "../providers/query-provider.js"
import { parseToolResult } from "../lib/parse-tool-result.js"

export interface UseToolQueryOptions<TData = unknown, TSelected = TData> {
  enabled?: boolean
  select?: (data: TData) => TSelected
}

/**
 * Loads data from a widget tool via TanStack Query.
 *
 * `args` is appended to the effective query key so two callers that share
 * the supplied `queryKey` but pass different `args` get separate cache
 * entries (otherwise the second caller silently reads stale data from the
 * first — the classic queryKey-vs-args trap). `select` transforms data on
 * each read without mutating the cache.
 */
export function useToolQuery<TData = unknown, TSelected = TData>(
  queryKey: unknown[],
  toolName: string,
  args: object,
  opts?: UseToolQueryOptions<TData, TSelected>,
) {
  const callTool = useCallTool()

  return useQuery<TData, Error, TSelected>({
    queryKey: [...queryKey, args],
    queryFn: async () => {
      if (!callTool) throw new Error("callTool not available")
      const result = await callTool(toolName, args)
      return parseToolResult<TData>(result)
    },
    select: opts?.select,
    enabled: !!callTool && (opts?.enabled ?? true),
  })
}

/**
 * Executes a mutation via a widget tool and invalidates configured query keys.
 */
export function useToolMutation<TData = unknown>(
  toolName: string,
  opts?: { invalidateKeys?: unknown[][] },
) {
  const callTool = useCallTool()
  const queryClient = useQueryClient()

  return useMutation<TData, Error, Record<string, unknown>>({
    mutationFn: async (args: Record<string, unknown>) => {
      if (!callTool) throw new Error("callTool not available")
      const result = await callTool(toolName, args)
      return parseToolResult<TData>(result)
    },
    onSuccess: async () => {
      if (opts?.invalidateKeys) {
        await Promise.all(
          opts.invalidateKeys.map((key) => queryClient.refetchQueries({ queryKey: key })),
        )
      }
    },
  })
}
