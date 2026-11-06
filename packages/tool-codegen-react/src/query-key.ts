import type {
  ToolInput,
  ToolMapOf,
  ToolName,
  ToolOutput,
} from "@miragon/mcp-toolkit-tool-codegen-core"
import type { DataTag } from "@tanstack/react-query"

/**
 * The query key of a tool query, `[namespace, toolName, args]`. The namespace comes first, so
 * `[namespace]` is the prefix of every query of one server (what a mutation invalidates by
 * default) and `[namespace, toolName]` that of every call of one tool.
 */
export type ToolQueryKey = readonly [namespace: string, toolName: string, args: unknown]

/**
 * The key of one call of a tool, typed by the tool map and tagged with the tool's output, so
 * the QueryClient's `getQueryData` and `setQueryData` know the data's type.
 */
export type ToolCallQueryKey<TMap extends ToolMapOf<TMap>, TName extends ToolName<TMap>> = DataTag<
  readonly [namespace: string, toolName: TName, args: ToolInput<TMap, TName>],
  ToolOutput<TMap, TName>
>

/** A query key prefix as a mutation's `invalidates` takes it: a namespace, then one of the map's tools. */
export type ToolQueryKeyPrefix<TMap extends ToolMapOf<TMap>> = readonly [
  namespace: string,
  toolName?: ToolName<TMap>,
  ...rest: unknown[],
]

/**
 * The key `useToolQuery` caches a call under, for `getQueryData`, `setQueryData` and
 * `invalidateQueries`. Typed by the tool map: an unknown tool name or wrong args do not compile.
 * TanStack Query hashes it by value, so equal args give the same key whatever their identity.
 * The generated `<name>QueryKey(tool, args)` passes the namespace for you.
 */
export function toolQueryKey<TMap extends ToolMapOf<TMap>, TName extends ToolName<TMap>>(
  namespace: string,
  toolName: TName,
  args: ToolInput<TMap, TName>,
): ToolCallQueryKey<TMap, TName> {
  // The output tag exists only in the type.
  return [namespace, toolName, args] as unknown as ToolCallQueryKey<TMap, TName>
}
