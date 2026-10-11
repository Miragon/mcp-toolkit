import { useCallback, useEffect, useRef } from "react"
import {
  hashKey,
  useMutation,
  useQuery,
  useQueryClient,
  type MutationFunctionContext,
  type UseMutationOptions,
  type UseMutationResult,
  type UseQueryResult,
} from "@tanstack/react-query"
import { useCallTool, useToolNameInQueryKey } from "../providers/query-provider.js"
import { parseToolResult } from "../lib/parse-tool-result.js"
import {
  claimToolQueryKey,
  invalidateToolQueries,
  NoToolTransportError,
  settleEachCall,
  toolKeyCollisionMessage,
  toolQueryKey,
  toolQueryOptions,
  type PerCallCallbacks,
  type UseToolQueryOptions,
} from "../lib/tool-query.js"

export type { UseToolQueryOptions } from "../lib/tool-query.js"

/**
 * The exact cache key `useToolQuery`, `useViewToolQuery` and `useViewData`
 * use for this tool and args under the nearest `AppQueryProvider`:
 * `toolQueryKey` with the provider's `toolNameInQueryKey` setting. For
 * `getQueryData`, `setQueryData` or `cancelQueries({ exact: true })`; prefix
 * invalidation needs only the caller's `queryKey`. A new array per render.
 */
export function useToolQueryKey(
  queryKey: readonly unknown[],
  toolName: string,
  args: object,
): unknown[] {
  return toolQueryKey(queryKey, toolName, args, useToolNameInQueryKey())
}

/**
 * Warns when two tools use one cache key (toolkit#176 K18): their answers
 * would overwrite each other. Only the 2.x key can collide: with the tool
 * name in the key (`toolNameInQueryKey`), two tools never share one.
 */
export function useToolKeyGuard(
  queryKey: readonly unknown[],
  toolName: string,
  args: object,
): void {
  const client = useQueryClient()
  const keyId = hashKey(useToolQueryKey(queryKey, toolName, args))
  useEffect(() => {
    const previous = claimToolQueryKey(client, keyId, toolName)
    if (previous !== null) console.warn(toolKeyCollisionMessage(keyId, toolName, previous))
  }, [client, keyId, toolName])
}

/**
 * Fetches a query again once a tool transport arrives, when it failed for
 * want of one ({@link NoToolTransportError}): a `callTool` that resolves
 * after the first render. TanStack refetches on a new key or `enabled`,
 * never on a new fetcher, so the query would keep the error until a remount.
 */
export function useRefetchOnTransport(
  callTool: unknown,
  query: Pick<UseQueryResult<unknown, Error>, "error" | "refetch">,
): void {
  const { error, refetch } = query
  useEffect(() => {
    if (callTool && error instanceof NoToolTransportError) void refetch()
  }, [callTool, error, refetch])
}

/**
 * Loads data from a widget tool via TanStack Query.
 *
 * The effective cache key is `[...queryKey, args]` (`toolQueryKey`): two
 * callers that share `queryKey` but pass different `args` get separate
 * entries. Two tools must not share a key and args; the hook warns when they
 * do. Under an `AppQueryProvider` with `toolNameInQueryKey` (opt-in in 2.x,
 * the default from the next major) the key is `[...queryKey, toolName,
 * args]` and two tools never collide; `useToolQueryKey` returns the key in
 * force. `opts` passes TanStack's query options through (`retry`,
 * `retryDelay`, `staleTime`, `placeholderData` / `keepPreviousData`,
 * `initialData` + `initialDataUpdatedAt`, `enabled`, `select`, …), and the
 * result exposes `refetch`, `failureCount` and `failureReason`. `retry`
 * defaults to the client's; `retry: shouldRetryToolCall` stops retrying a
 * tool's own `isError` answer.
 *
 * The tool goes through `AppQueryProvider`'s `callTool`, else the nearest
 * `HostBridgeProvider`'s bridge; with neither, the query fails with a
 * "no tool transport" error instead of idling, and fetches once one arrives.
 */
export function useToolQuery<TData = unknown, TSelected = TData>(
  queryKey: readonly unknown[],
  toolName: string,
  args: object,
  opts?: UseToolQueryOptions<TData, TSelected>,
): UseQueryResult<TSelected, Error> {
  const callTool = useCallTool()
  const toolNameInKey = useToolNameInQueryKey()
  useToolKeyGuard(queryKey, toolName, args)
  const query = useQuery<TData, Error, TSelected>(
    toolQueryOptions<TData, TSelected>(queryKey, toolName, args, callTool, opts, {
      toolNameInKey,
    }),
  )
  useRefetchOnTransport(callTool, query)
  return query
}

/** Options of {@link useToolMutation}: TanStack's mutation options plus `invalidateKeys`. */
export type UseToolMutationOptions<TData = unknown> = Omit<
  UseMutationOptions<TData, Error, Record<string, unknown>, unknown>,
  "mutationFn" | "onMutate"
> & {
  /** Query keys (prefixes) to invalidate after a successful call. */
  invalidateKeys?: unknown[][]
}

/**
 * Executes a mutation via a widget tool and invalidates `invalidateKeys`
 * after each successful call (`invalidateQueries`: active queries refetch,
 * inactive ones are marked stale and refetch when they are next used).
 *
 * `mutate(args, { onSuccess, onError, onSettled })` fires its per-call
 * callbacks for EVERY call while the component is mounted, not only for the
 * latest one (TanStack's own rule), so two quick calls each get their
 * confirmation. The hook-level callbacks in `opts` run first; the
 * invalidation runs before the hook-level `onSuccess`.
 */
export function useToolMutation<TData = unknown>(
  toolName: string,
  opts?: UseToolMutationOptions<TData>,
): UseMutationResult<TData, Error, Record<string, unknown>> {
  const callTool = useCallTool()
  const queryClient = useQueryClient()
  const { invalidateKeys, onSuccess, ...options } = opts ?? {}

  const mutation = useMutation<TData, Error, Record<string, unknown>>({
    ...options,
    mutationFn: async (args: Record<string, unknown>) => {
      if (!callTool) throw new NoToolTransportError(toolName)
      const result = await callTool(toolName, args)
      return parseToolResult<TData>(result)
    },
    onSuccess: async (data, variables, onMutateResult, context) => {
      await invalidateToolQueries(queryClient, invalidateKeys)
      await onSuccess?.(data, variables, onMutateResult, context)
    },
  })

  // Per-call callbacks fire only while mounted (TanStack's rule, kept), with
  // the latest meta/mutationKey. Both refs are written in effects and read
  // only when a call settles, so `mutate` stays stable across renders.
  const mounted = useRef(false)
  const scope = useRef<Pick<MutationFunctionContext, "meta" | "mutationKey">>({
    meta: undefined,
    mutationKey: undefined,
  })
  useEffect(() => {
    scope.current = { meta: options.meta, mutationKey: options.mutationKey }
  })
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])
  const { mutateAsync } = mutation
  const mutate = useCallback(
    (
      variables: Record<string, unknown>,
      callbacks?: PerCallCallbacks<TData, Record<string, unknown>>,
    ) => {
      settleEachCall(mutateAsync(variables), variables, callbacks, () =>
        mounted.current ? { client: queryClient, ...scope.current } : null,
      )
    },
    [mutateAsync, queryClient],
  )
  return { ...mutation, mutate }
}
