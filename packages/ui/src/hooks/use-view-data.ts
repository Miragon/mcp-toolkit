import { useToolQuery } from "./use-tool-query.js"

export interface ViewDataResult<T> {
  data: T | null
  /** True while self-fetching with no data yet — the first paint of a cockpit cell. */
  loading: boolean
  error: Error | null
}

/**
 * The seam that lets one widget component serve both modes without a duplicate UI.
 *
 * Standalone (a `*_show_*` widget) the agent's tool result is handed in via
 * `initialData` (from the view's stepData, e.g. through `adaptDataWidget`) and
 * returned verbatim. Embedded in a self-fetching cockpit only scope params are
 * passed, so the component fetches `tool` with `args` under `key` — disabled
 * unless data is absent AND `ready` (i.e. the required id/key is present).
 * Sibling widgets sharing `key` dedupe to a single call, so a composed view of
 * N widgets over one data feed fetches once.
 */
export function useViewData<T>(
  initialData: T | null | undefined,
  key: ReadonlyArray<unknown>,
  tool: string,
  args: Record<string, unknown>,
  ready: boolean,
): ViewDataResult<T> {
  const query = useToolQuery<T>([...key], tool, args, { enabled: !initialData && ready })
  const data = initialData ?? query.data ?? null
  return { data, loading: !data && ready && !query.isError, error: query.error ?? null }
}
