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
import { retryUnlessToolError, toolQueryFn } from "./query-options.js"

/** Every `useQuery` option except the two the hook owns: `queryKey` and `queryFn`. */
export type UseToolQueryOptions<TOutput, TSelected = TOutput> = Omit<
  UseQueryOptions<TOutput, Error, TSelected, ToolQueryKey>,
  "queryKey" | "queryFn"
>

/**
 * Calls a tool as a TanStack query, cached under `toolQueryKey(namespace, name, args)`, with
 * the caller the `ToolCallerProvider` supplies for `namespace`.
 *
 * - Waits (`enabled: false`) while that provider has no caller, on top of `options.enabled`.
 * - Hands TanStack's `AbortSignal` to the caller, so an unmounted or cancelled query aborts the
 *   call.
 * - Without `options.retry`, never retries a `ToolCallError` (the tool ran and answered
 *   `isError`) or a `NoToolCallerError`; any other failure retries as the QueryClient's defaults
 *   for the key say, 3 times when they say nothing.
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

  return useQuery<ToolOutput<TMap, TName>, Error, TSelected, ToolQueryKey>({
    ...options,
    queryKey,
    queryFn: toolQueryFn<TMap, TName>(callTool, name, args),
    retry: options?.retry ?? retryUnlessToolError(queryClient, queryKey),
    // Only ever set to false: an `enabled: undefined` would shadow the QueryClient's defaults.
    ...(callTool === null ? { enabled: false } : {}),
  })
}
