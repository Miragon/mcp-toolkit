/**
 * The plain logic behind `useToolQuery`, `useViewToolQuery`, `useViewData`
 * and `useToolMutation` (toolkit#176 K18): the effective cache key and its
 * collision guard, the opt-in retry policy for tool errors, the TanStack
 * options a tool query runs with, and per-call mutation callbacks that fire
 * for EVERY call. No React, no `mcp-use/react`, so it is unit-tested without
 * a renderer.
 */
import {
  hashKey,
  type MutateOptions,
  type MutationFunctionContext,
  type QueryClient,
  type UseQueryOptions,
} from "@tanstack/react-query"
import { isToolError, parseToolResult } from "./parse-tool-result.js"

/** A `(name, args)` tool caller — the shape of `useCallTool()` and `HostBridge.callTool`. */
export type ToolCaller = (name: string, args: object) => Promise<unknown>

/**
 * TanStack query options a tool query passes through: everything except the
 * key and the fetcher, which the hooks build from the tool and its args
 * (`retry`, `retryDelay`, `staleTime`, `placeholderData` / `keepPreviousData`,
 * `initialData` + `initialDataUpdatedAt`, `enabled`, `select`, …).
 */
export type UseToolQueryOptions<TData = unknown, TSelected = TData> = Omit<
  UseQueryOptions<TData, Error, TSelected>,
  "queryKey" | "queryFn"
>

/**
 * Neither an `AppQueryProvider` `callTool` nor a `HostBridgeProvider` is in
 * reach, so the query cannot call any tool. Never retried: nothing changes
 * until the mount does.
 */
export class NoToolTransportError extends Error {
  constructor(toolName: string) {
    super(
      `[mcp-toolkit] cannot call "${toolName}": no tool transport. Mount the widget under ` +
        "AppQueryProvider with callTool, or a HostBridgeProvider.",
    )
    this.name = "NoToolTransportError"
  }
}

/** Retries {@link shouldRetryToolCall} grants a failed transport (TanStack's own default count). */
export const TOOL_QUERY_RETRIES = 3

/**
 * A retry policy for tool queries: up to {@link TOOL_QUERY_RETRIES} retries
 * for a failed transport, none for a tool's own `isError` answer
 * (`isToolError`) or a missing transport — repeating a deterministic answer
 * only repeats it and holds the error back about 7 s.
 *
 * Opt-in in 2.x (the hooks keep the client's `retry`, TanStack's 3 by
 * default, because a tool may also answer a transient failure with
 * `isError`): pass `retry: shouldRetryToolCall` to a hook, or set it as the
 * client's default (`queryClient.setDefaultOptions`, or an `AppQueryProvider`
 * `client` of your own).
 */
export function shouldRetryToolCall(failureCount: number, error: unknown): boolean {
  if (isToolError(error) || error instanceof NoToolTransportError) return false
  return failureCount < TOOL_QUERY_RETRIES
}

/**
 * The effective cache key of a tool query (toolkit#176 K18).
 *
 * - 2.x default: the caller's key, then the args (`[...queryKey, args]`), so
 *   two callers sharing a key with different args get separate entries.
 * - `toolNameInKey`: the caller's key, the tool name, then the args
 *   (`[...queryKey, toolName, args]`), so two tools never share an entry,
 *   whatever key their callers pass. Opt-in in 2.x (`AppQueryProvider` /
 *   `McpAppView` `toolNameInQueryKey`), the default from the next major.
 *
 * Build exact keys (`getQueryData`, `setQueryData`, `cancelQueries` with
 * `exact: true`) with this helper, or with `useToolQueryKey`, which reads the
 * provider's setting, rather than by hand: code that goes through them keeps
 * working when the default changes. Prefix invalidation by `queryKey`
 * matches either way.
 */
export function toolQueryKey(
  queryKey: readonly unknown[],
  toolName: string,
  args: object,
  toolNameInKey = false,
): unknown[] {
  return toolNameInKey ? [...queryKey, toolName, args] : [...queryKey, args]
}

/**
 * The tool that last claimed each cache key, per client — the guard against
 * two tools sharing one entry (their answers would overwrite each other).
 */
const keyOwners = new WeakMap<QueryClient, Map<string, string>>()

/**
 * Claim the cache key `keyId` (`hashKey` of a {@link toolQueryKey}) for
 * `toolName` on `client`. Returns the tool that held it
 * before when that is ANOTHER tool — a collision the hooks report — else
 * `null`. The latest claim wins, so each collision is reported once per
 * switch.
 */
export function claimToolQueryKey(
  client: QueryClient,
  keyId: string,
  toolName: string,
): string | null {
  const owners = keyOwners.get(client) ?? new Map<string, string>()
  keyOwners.set(client, owners)
  const previous = owners.get(keyId)
  owners.set(keyId, toolName)
  return previous !== undefined && previous !== toolName ? previous : null
}

/** The console line for a {@link claimToolQueryKey} collision. */
export function toolKeyCollisionMessage(keyId: string, toolName: string, previous: string): string {
  return (
    `[mcp-toolkit] the query key ${keyId} is used by "${previous}" and "${toolName}": ` +
    "both share one cache entry and overwrite each other's answer. Give each tool its own queryKey."
  )
}

/** How {@link toolQueryOptions} decodes a result and builds the key. */
export interface ToolQueryBuild<TData> {
  /** Decodes the tool result. Default: `parseToolResult` (structured-first). */
  decode?: (result: unknown) => TData
  /** Put the tool name into the key (see {@link toolQueryKey}). Default `false`. */
  toolNameInKey?: boolean
}

/**
 * The TanStack options of a tool query: the caller's options, the
 * {@link toolQueryKey} and a fetcher that calls `toolName` and decodes the
 * result. `retry` stays the caller's, else the client's default; only a
 * missing transport is never retried. Without a transport the fetcher fails
 * with {@link NoToolTransportError} instead of leaving the query idle.
 */
export function toolQueryOptions<TData, TSelected = TData>(
  queryKey: readonly unknown[],
  toolName: string,
  args: object,
  callTool: ToolCaller | undefined,
  opts?: UseToolQueryOptions<TData, TSelected>,
  build: ToolQueryBuild<TData> = {},
): UseQueryOptions<TData, Error, TSelected> {
  const decode = build.decode ?? ((result: unknown) => parseToolResult<TData>(result))
  return {
    ...opts,
    // An omitted `retry` must stay omitted: an explicit `undefined` would
    // shadow the client's default.
    ...(callTool ? null : { retry: false }),
    queryKey: toolQueryKey(queryKey, toolName, args, build.toolNameInKey),
    queryFn: async () => {
      if (!callTool) throw new NoToolTransportError(toolName)
      return decode(await callTool(toolName, args))
    },
  }
}

/**
 * The content of the payload last seeded per query key, per client: a
 * remounted or re-rendered OLD payload must not roll a refetched answer
 * back, while a payload not seeded before is a new delivery and wins.
 */
const lastSeeded = new WeakMap<QueryClient, Map<string, string>>()

function contentOf(value: unknown): string | undefined {
  try {
    return JSON.stringify(value)
  } catch {
    return undefined
  }
}

/**
 * Seed `queryKey` with host-delivered `seed`: written when the entry is
 * empty, or when the seed is a payload this client has not seeded for the
 * key before (a new delivery). Returns whether the cache was written.
 */
export function seedToolQuery(
  client: QueryClient,
  queryKey: readonly unknown[],
  seed: unknown,
  updatedAt?: number,
): boolean {
  const keyId = hashKey(queryKey)
  const seeded = lastSeeded.get(client) ?? new Map<string, string>()
  lastSeeded.set(client, seeded)
  const content = contentOf(seed)
  const delivered = content === undefined || seeded.get(keyId) !== content
  if (content !== undefined) seeded.set(keyId, content)
  if (!delivered && client.getQueryData(queryKey) !== undefined) return false
  client.setQueryData(queryKey, seed, updatedAt === undefined ? undefined : { updatedAt })
  return true
}

/** Callbacks of one `mutate` call, typed as TanStack's per-call options. */
export type PerCallCallbacks<TData, TVariables> = MutateOptions<TData, Error, TVariables, unknown>

function settle(run: () => void): void {
  try {
    run()
  } catch (err) {
    // Surface a throwing callback as an unhandled rejection, as TanStack
    // does, without skipping the callbacks after it.
    void Promise.reject(err instanceof Error ? err : new Error(String(err)))
  }
}

/**
 * Fire one call's per-call `onSuccess` / `onError` / `onSettled` once `call`
 * settles — for EVERY call. TanStack's own `mutate` keeps only the latest
 * call's callbacks, so two quick calls (retrying two incidents in a row)
 * would confirm only the second. `context()` is read when the call settles:
 * `null` (the component unmounted) skips the callbacks, as TanStack does.
 * A rejected `call` is handled here, never left unhandled.
 */
export function settleEachCall<TData, TVariables>(
  call: Promise<TData>,
  variables: TVariables,
  callbacks: PerCallCallbacks<TData, TVariables> | undefined,
  context: () => MutationFunctionContext | null,
): void {
  call.then(
    (data) => {
      const ctx = callbacks ? context() : null
      if (!callbacks || !ctx) return
      settle(() => callbacks.onSuccess?.(data, variables, undefined, ctx))
      settle(() => callbacks.onSettled?.(data, null, variables, undefined, ctx))
    },
    (error: Error) => {
      const ctx = callbacks ? context() : null
      if (!callbacks || !ctx) return
      settle(() => callbacks.onError?.(error, variables, undefined, ctx))
      settle(() => callbacks.onSettled?.(undefined, error, variables, undefined, ctx))
    },
  )
}

/**
 * Invalidate the query keys (prefixes) a mutation names: matching ACTIVE
 * queries refetch now, inactive ones are only marked stale and refetch when
 * they are next used — never a refetch of every inactive cached page.
 */
export async function invalidateToolQueries(
  client: QueryClient,
  keys: readonly (readonly unknown[])[] | undefined,
): Promise<void> {
  if (!keys) return
  await Promise.all(keys.map((queryKey) => client.invalidateQueries({ queryKey })))
}
