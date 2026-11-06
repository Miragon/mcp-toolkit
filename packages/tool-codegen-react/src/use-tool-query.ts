import type {
  ToolInput,
  ToolMapOf,
  ToolName,
  ToolOutput,
} from "@miragon/mcp-toolkit-tool-codegen-core"
import {
  useQuery,
  useQueryClient,
  type UseQueryOptions,
  type UseQueryResult,
} from "@tanstack/react-query"
import { useToolCaller } from "./provider.js"
import { toolQueryKey, type ToolQueryKey } from "./query-key.js"
import { toolQueryFn, toolQueryRetry, type ToolQueryCallOptions } from "./query-options.js"

/**
 * Every `useQuery` option except the two the hook owns, `queryKey` and `queryFn`, plus the tool
 * call's own options.
 */
export type UseToolQueryOptions<TOutput, TSelected = TOutput> = Omit<
  UseQueryOptions<TOutput, Error, TSelected, ToolQueryKey>,
  "queryKey" | "queryFn"
> & {
  /** Timeouts and progress for the tool call; not part of the query key. */
  callOptions?: ToolQueryCallOptions
}

/**
 * Calls a tool as a TanStack query, cached under `toolQueryKey(namespace, name, args)`, with
 * the caller the `ToolCallerProvider` supplies for `namespace`.
 *
 * - Waits (`enabled: false`) while that provider has no caller, on top of `options.enabled`.
 * - Hands `options.callOptions` and TanStack's `AbortSignal` to the caller, so an unmounted or
 *   cancelled query aborts the call.
 * - Without `options.retry`, never retries a `ToolCallError` (the tool ran and answered
 *   `isError`), a `NoToolCallerError` or the MCP SDK's request timeout (a retry would wait the
 *   whole timeout again); any other failure retries as the QueryClient's defaults for the key
 *   say, and as TanStack does when they say nothing: 3 times, on the server not at all.
 */
export function useToolQuery<
  TMap extends ToolMapOf<TMap>,
  TName extends ToolName<TMap>,
  TSelected = ToolOutput<TMap, TName>,
>(
  namespace: string,
  name: TName,
  args: ToolInput<TMap, TName>,
  options?: UseToolQueryOptions<ToolOutput<TMap, TName>, TSelected>,
): UseQueryResult<TSelected, Error> {
  const callTool = useToolCaller(namespace)
  const queryClient = useQueryClient()
  const queryKey = toolQueryKey<TMap, TName>(namespace, name, args)
  const { callOptions, ...queryOptions } = options ?? {}

  return useQuery<ToolOutput<TMap, TName>, Error, TSelected, ToolQueryKey>({
    ...queryOptions,
    queryKey,
    queryFn: toolQueryFn<TMap, TName>(callTool, name, args, callOptions),
    retry: queryOptions.retry ?? toolQueryRetry(queryClient, queryKey),
    // Only ever set to false: an `enabled: undefined` would shadow the QueryClient's defaults.
    ...(callTool === null ? { enabled: false } : {}),
  })
}
