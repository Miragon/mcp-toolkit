import {
  isToolCallError,
  type ToolCallOptions,
  type ToolCaller,
  type ToolInput,
  type ToolMapOf,
  type ToolName,
  type ToolOutput,
} from "@miragon/mcp-toolkit-tool-codegen-core"
import {
  environmentManager,
  type QueryClient,
  type QueryFunction,
  type UseQueryOptions,
} from "@tanstack/react-query"
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
  /**
   * The client whose retry defaults decide failures other than the tool's own answer and a
   * request timeout.
   */
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
 * The messages of the v1 SDK's own request timeouts, `timeout` and `maxTotalTimeout`, as its
 * `McpError` spells them.
 */
const V1_TIMEOUT_MESSAGES: ReadonlySet<unknown> = new Set([
  "MCP error -32001: Request timed out",
  "MCP error -32001: Maximum total timeout exceeded",
])

/**
 * True for the MCP SDK's request timeout: the call's `timeout` ran out, or progress kept it alive
 * past `maxTotalTimeout`. The v2 SDK (`@modelcontextprotocol/client`, which ext-apps' `App` runs
 * on) rejects with an `SdkError` of code `"REQUEST_TIMEOUT"`, a string no server error carries.
 * The v1 SDK (`@modelcontextprotocol/sdk`) rejects with an `McpError` of code `-32001`, the code
 * it also gives an error a server sends with it (v2's convention for an unknown session), so a
 * v1 error counts only with the message of one of its own timeouts. Read from the code and the
 * message alone, so the package needs no SDK and recognises the error of any copy of it, also of
 * one up to 1.5.0, whose `McpError` does not set its `name`. Both SDKs give a call that its
 * signal aborted the timeout's code; the retry rule never sees one, since TanStack settles a
 * cancelled query before it aborts the signal.
 */
export function isRequestTimeout(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false
  const { code, message } = error as { code?: unknown; message?: unknown }
  if (code === "REQUEST_TIMEOUT") return true
  return code === -32001 && V1_TIMEOUT_MESSAGES.has(message)
}

/**
 * TanStack's retry when nothing sets one: 3 in the browser, none on the server, where a failed
 * render should not wait for retries. `environmentManager` is what TanStack's own retryer reads
 * (no `window`, or Deno, unless `setIsServer` overrides it).
 */
const tanstackDefaultRetry = () => (environmentManager.isServer() ? 0 : 3)

/**
 * The retry of a tool query: never for a `ToolCallError` (asking the tool again gets the same
 * answer), a `NoToolCallerError` (a caller that arrives later starts the query by itself) or a
 * request timeout (each retry waits the whole timeout again: with `callOptions.timeout` at five
 * minutes, TanStack's 3 retries would keep the query pending for twenty), else as the
 * QueryClient's defaults for the key say, and without them as TanStack's own default. Read at
 * failure time, so those defaults stay in charge.
 */
export function toolQueryRetry(queryClient: QueryClient, queryKey: ToolQueryKey) {
  return (failureCount: number, error: Error): boolean => {
    if (isToolCallError(error) || isNoToolCallerError(error) || isRequestTimeout(error)) {
      return false
    }
    const retry =
      queryClient.getQueryDefaults(queryKey).retry ??
      queryClient.getDefaultOptions().queries?.retry ??
      tanstackDefaultRetry()
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
    retry: toolQueryRetry(queryClient, queryKey),
  }
}
