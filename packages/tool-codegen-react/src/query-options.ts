import {
  isToolCallError,
  type ToolCallOptions,
  type ToolCaller,
  type ToolInput,
  type ToolMapOf,
  type ToolName,
  type ToolOutput,
} from "@miragon/mcp-toolkit-tool-codegen-core"
import type { QueryClient, QueryFunction, UseQueryOptions } from "@tanstack/react-query"
import { callToolTyped } from "./call-tool.js"
import { isNoToolCallerError } from "./provider.js"
import { toolQueryKey, type ToolCallQueryKey, type ToolQueryKey } from "./query-key.js"

/**
 * The options a query hands its tool call: timeouts and progress, everything of
 * `ToolCallOptions` but the signal, which TanStack owns (it aborts the call on unmount and on
 * cancel). They are not part of the query key.
 */
export type ToolQueryCallOptions = Omit<ToolCallOptions, "signal">

/**
 * What a tool query runs with, outside a component: the caller, the QueryClient and the call's
 * options.
 */
export interface ToolQueryContext {
  /** The caller to call the tool with; `null` fails the query with a `NoToolCallerError`. */
  callTool: ToolCaller | null
  /** The client whose retry defaults decide failures other than the tool's own answer. */
  queryClient: QueryClient
  /** Timeouts and progress for the call. */
  callOptions?: ToolQueryCallOptions
}

/** The queryFn of a tool query: one typed call, with its options and TanStack's abort signal. */
export function toolQueryFn<TMap extends ToolMapOf<TMap>, TName extends ToolName<TMap>>(
  callTool: ToolCaller | null,
  name: TName,
  args: ToolInput<TMap, TName>,
  callOptions?: ToolQueryCallOptions,
) {
  // The signal last: a signal smuggled into callOptions never replaces TanStack's.
  return ({ signal }: { signal: AbortSignal }) =>
    callToolTyped<TMap, TName>(callTool, name, args, { ...callOptions, signal })
}

/**
 * The retry of a tool query: never for a `ToolCallError` (asking the tool again gets the same
 * answer) or a `NoToolCallerError` (a caller that arrives later starts the query by itself),
 * else as the QueryClient's defaults for the key say. Read at failure time, so those defaults
 * stay in charge.
 */
export function retryUnlessToolError(queryClient: QueryClient, queryKey: ToolQueryKey) {
  return (failureCount: number, error: Error): boolean => {
    if (isToolCallError(error) || isNoToolCallerError(error)) return false
    const retry =
      queryClient.getQueryDefaults(queryKey).retry ??
      queryClient.getDefaultOptions().queries?.retry ??
      3
    if (typeof retry === "function") return retry(failureCount, error)
    return typeof retry === "number" ? failureCount < retry : retry
  }
}

/** The query options of one tool call: TanStack's, with the key and the queryFn always set. */
export type ToolQueryOptions<
  TMap extends ToolMapOf<TMap>,
  TName extends ToolName<TMap>,
> = UseQueryOptions<
  ToolOutput<TMap, TName>,
  Error,
  ToolOutput<TMap, TName>,
  ToolCallQueryKey<TMap, TName>
> & {
  queryKey: ToolCallQueryKey<TMap, TName>
  queryFn: QueryFunction<ToolOutput<TMap, TName>, ToolCallQueryKey<TMap, TName>>
}

/**
 * The options `useToolQuery` runs a tool call with, for what takes options instead of a hook:
 * `useSuspenseQuery`, `useQueries`, `queryClient.prefetchQuery` and `ensureQueryData`. The key,
 * the call (with the context's `callOptions` and TanStack's abort signal) and the retry rule are
 * the hook's own.
 */
export function toolQueryOptions<TMap extends ToolMapOf<TMap>, TName extends ToolName<TMap>>(
  namespace: string,
  name: TName,
  args: ToolInput<TMap, TName>,
  { callTool, queryClient, callOptions }: ToolQueryContext,
): ToolQueryOptions<TMap, TName> {
  const queryKey = toolQueryKey<TMap, TName>(namespace, name, args)
  return {
    queryKey,
    queryFn: toolQueryFn<TMap, TName>(callTool, name, args, callOptions),
    retry: retryUnlessToolError(queryClient, queryKey),
  }
}
