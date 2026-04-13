import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { useCallTool } from "../providers/query-provider.js"

function parseToolResult(result: unknown): unknown {
  const r = result as Record<string, unknown> | undefined
  const content = r?.content as { text?: string }[] | undefined
  if (r?.isError) throw new Error(content?.[0]?.text ?? "Tool call failed")
  const text = content?.[0]?.text
  if (text) {
    try {
      return JSON.parse(text)
    } catch {
      return text
    }
  }
  return r?.structuredContent ?? r
}

/**
 * Loads data from a widget tool via TanStack Query.
 * Widgets sharing a query key share the cache.
 * `select` transforms data on each read without mutating the cache.
 */
export function useToolQuery<TData = unknown, TSelected = TData>(
  queryKey: unknown[],
  toolName: string,
  args: Record<string, unknown>,
  opts?: { enabled?: boolean; select?: (data: TData) => TSelected },
) {
  const callTool = useCallTool()

  return useQuery<TData, Error, TSelected>({
    queryKey,
    queryFn: async () => {
      if (!callTool) throw new Error("callTool not available")
      const result = await callTool(toolName, args)
      return parseToolResult(result) as TData
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
      return parseToolResult(result) as TData
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
