import { useCallback, useState } from "react"
import { hashKey, useQueryClient } from "@tanstack/react-query"
import { seedToolQuery, type UseToolQueryOptions } from "../lib/tool-query.js"
import { useToolQuery, useToolQueryKey } from "./use-tool-query.js"

export interface ViewDataResult<T> {
  data: T | null
  /** True while self-fetching with no data yet — the first paint of a cockpit cell. */
  loading: boolean
  error: Error | null
  /**
   * Fetch `tool` again now: the retry of an error state
   * (`<ErrorState onRetry={refetch} … />`) or a manual refresh — a new read
   * even while a failed fetch still waits on its retry backoff. In `"static"`
   * mode host-pushed data, when present, stays what `data` returns.
   */
  refetch: () => void
  /** Failed attempts of the current fetch (0 once it succeeds). */
  failureCount: number
  /**
   * The current fetch's last failed attempt — set from the first failure on,
   * while the query still retries (`error` waits for the last retry).
   */
  failureReason: Error | null
  /** A fetch is in flight (the first one or a refetch). */
  isFetching: boolean
  /**
   * `data` is a placeholder (`placeholderData`, e.g. `keepPreviousData`):
   * the previous args' answer while the current args' fetch runs or failed.
   */
  isPlaceholderData: boolean
}

/**
 * How {@link useViewData} treats host-pushed `initialData`.
 *
 * - `"static"` (default): returned verbatim; the feed query stays off while
 *   it is present.
 * - `"seed"`: it becomes the feed query's cached answer, and the query stays
 *   live (once `ready`): an invalidation after a write, a `refetch` or a
 *   retry re-reads the feed. A fresh seed is not refetched on mount (it is
 *   younger than `staleTime`); a payload delivered anew (content not seeded
 *   for the key before) replaces the cached answer, while a re-rendered or
 *   remounted old one never rolls a refetched answer back.
 */
export type ViewDataMode = "static" | "seed"

/**
 * Options of {@link useViewData}: TanStack's query options for the feed
 * (`retry`, `retryDelay`, `staleTime`, `placeholderData` /
 * `keepPreviousData`, `enabled` as an extra gate next to `ready`, …),
 * plus how host data seeds it.
 */
export type UseViewDataOptions<T> = Omit<UseToolQueryOptions<T>, "initialData" | "select"> & {
  initialDataMode?: ViewDataMode
}

/**
 * The seam that lets one widget component serve both modes without a duplicate UI.
 *
 * Standalone (a `*_show_*` widget) the agent's tool result is handed in via
 * `initialData` (from the view's stepData, e.g. through `adaptDataWidget`).
 * Embedded in a self-fetching cockpit only scope params are passed, so the
 * component fetches `tool` with `args` under `key`, gated on `ready` (i.e.
 * the required id/key is present). Sibling widgets sharing `key` and `args`
 * dedupe to a single call, so a composed view of N widgets over one data
 * feed fetches once.
 *
 * By default host data is returned verbatim and switches the query off;
 * `initialDataMode: "seed"` keeps the query live over it instead (see
 * {@link ViewDataMode}). `options` passes TanStack's query options through.
 */
export function useViewData<T>(
  initialData: T | null | undefined,
  key: ReadonlyArray<unknown>,
  tool: string,
  args: Record<string, unknown>,
  ready: boolean,
  options?: UseViewDataOptions<T>,
): ViewDataResult<T> {
  const { initialDataMode = "static", enabled, ...queryOptions } = options ?? {}
  const seeding = initialDataMode === "seed"
  const cacheKey = useStableKey(useToolQueryKey(key, tool, args))
  useSeed(seeding ? initialData : null, cacheKey, queryOptions.initialDataUpdatedAt)

  const active = ready && enabled !== false
  const fetches = active && (seeding || !initialData)
  const query = useToolQuery<T>([...key], tool, args, {
    ...queryOptions,
    enabled: typeof enabled === "function" ? (q) => fetches && enabled(q) : fetches,
  })
  const data = seeding ? (query.data ?? initialData) : (initialData ?? query.data)
  const refetch = useFreshRefetch(cacheKey, query.refetch)
  return {
    data: data ?? null,
    // The query's own verdict: a function `enabled` that returns false idles
    // like `enabled: false`, never an endless skeleton.
    loading: !data && query.isEnabled && !query.isError,
    error: query.error,
    refetch,
    failureCount: query.failureCount,
    failureReason: query.failureReason,
    isFetching: query.isFetching,
    isPlaceholderData: query.isPlaceholderData,
  }
}

/** `key`, kept by content: callers build `key`/`args` anew every render. */
function useStableKey(key: unknown[]): unknown[] {
  const id = hashKey(key)
  const [stable, setStable] = useState({ id, key })
  if (stable.id !== id) setStable({ id, key })
  return stable.id === id ? stable.key : key
}

/**
 * `"seed"` mode: write the host's payload into the feed's cache entry in the
 * render phase, before the query's observer reads the cache — what TanStack's
 * own `initialData` does (see {@link seedToolQuery} for when it wins over a
 * cached answer). The last processed seed skips the content check while the
 * same object comes in render after render.
 */
function useSeed(
  seed: unknown,
  cacheKey: unknown[],
  updatedAt: number | (() => number | undefined) | undefined,
): void {
  const client = useQueryClient()
  const keyId = hashKey(cacheKey)
  const [seen, setSeen] = useState<{ seed: unknown; keyId: string } | null>(null)
  if (seed == null || (seen?.seed === seed && seen.keyId === keyId)) return
  const at = typeof updatedAt === "function" ? updatedAt() : updatedAt
  const written = seedToolQuery(client, cacheKey, seed, at)
  // Only a real change re-renders: an equal new object per render must not loop.
  if (written || seen?.keyId !== keyId) setSeen({ seed, keyId })
}

/**
 * A refetch that reads anew at once. TanStack restarts an in-flight fetch only
 * over data (`cancelRefetch`); a key without data joins the running retry
 * chain and waits out its backoff. So cancel that chain first, then read.
 */
function useFreshRefetch(cacheKey: unknown[], refetchQuery: () => Promise<unknown>): () => void {
  const client = useQueryClient()
  return useCallback(() => {
    if (client.getQueryData(cacheKey) !== undefined) {
      void refetchQuery()
      return
    }
    void client.cancelQueries({ queryKey: cacheKey, exact: true }).then(() => refetchQuery())
  }, [client, cacheKey, refetchQuery])
}
