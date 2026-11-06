import type {
  ToolCallOptions,
  ToolInput,
  ToolMapOf,
  ToolName,
  ToolOutput,
} from "@miragon/mcp-toolkit-tool-codegen-core"
import {
  useMutation,
  useQueryClient,
  type UseMutationOptions,
  type UseMutationResult,
} from "@tanstack/react-query"
import { callToolTyped } from "./call-tool.js"
import { useToolCaller } from "./provider.js"
import type { ToolQueryKeyPrefix } from "./query-key.js"

/** `{}`: the args of a tool whose input has no required property. */
type NoArgs = Record<never, never>

/**
 * The variables of a tool's mutation: its input, which `mutate()` may leave out when `{}` is a
 * valid one (it then sends `{}`).
 */
export type ToolMutationVariables<TMap extends ToolMapOf<TMap>, TName extends ToolName<TMap>> =
  NoArgs extends ToolInput<TMap, TName> ? ToolInput<TMap, TName> | void : ToolInput<TMap, TName>

export type UseToolMutationOptions<
  TMap extends ToolMapOf<TMap>,
  TName extends ToolName<TMap>,
  TOnMutateResult = unknown,
> = Omit<
  UseMutationOptions<
    ToolOutput<TMap, TName>,
    Error,
    ToolMutationVariables<TMap, TName>,
    TOnMutateResult
  >,
  "mutationFn"
> & {
  /**
   * The query key prefixes to invalidate once the tool succeeded, each a namespace and
   * optionally one of the map's tool names. Default: `[namespace]`, every query of the same
   * server. `false` invalidates nothing.
   */
  invalidates?: false | readonly ToolQueryKeyPrefix<TMap>[]
  /**
   * The options of every call `mutate` makes: timeouts, progress, and a signal, since a mutation
   * has none of its own (once it is aborted, every later `mutate` fails at once).
   */
  callOptions?: ToolCallOptions
}

/**
 * Calls a tool as a TanStack mutation, with the caller the `ToolCallerProvider` supplies for
 * `namespace`: `mutate(args)` runs it and resolves with its parsed output.
 *
 * After a success it invalidates the queries `options.invalidates` names, runs
 * `options.onSuccess`, and settles once both are done: the invalidated queries on screen have
 * refetched when `mutateAsync` resolves. Without `invalidates` it invalidates every query of the
 * namespace and settles without waiting for them. Without a caller, `mutate` rejects with a
 * `NoToolCallerError`. `TOnMutateResult` is what `onMutate` returns, the context `onError` and
 * `onSettled` receive (an optimistic update's snapshot).
 */
export function useToolMutation<
  TMap extends ToolMapOf<TMap>,
  TName extends ToolName<TMap>,
  TOnMutateResult = unknown,
>(
  namespace: string,
  name: TName,
  options?: UseToolMutationOptions<TMap, TName, TOnMutateResult>,
): UseMutationResult<
  ToolOutput<TMap, TName>,
  Error,
  ToolMutationVariables<TMap, TName>,
  TOnMutateResult
> {
  const callTool = useToolCaller(namespace)
  const queryClient = useQueryClient()
  const { invalidates, onSuccess, callOptions, ...mutationOptions } = options ?? {}

  return useMutation<
    ToolOutput<TMap, TName>,
    Error,
    ToolMutationVariables<TMap, TName>,
    TOnMutateResult
  >({
    ...mutationOptions,
    mutationFn: (args) => callToolTyped<TMap, TName>(callTool, name, args ?? {}, callOptions),
    onSuccess: async (data, args, onMutateResult, context) => {
      // Not awaited: the default covers every query of the server, and one of them failing at
      // the transport would hold the mutation pending through all of its retries.
      if (invalidates === undefined) void queryClient.invalidateQueries({ queryKey: [namespace] })
      const invalidated = (invalidates || []).map((queryKey) =>
        queryClient.invalidateQueries({ queryKey }),
      )
      await onSuccess?.(data, args, onMutateResult, context)
      await Promise.all(invalidated)
    },
  })
}
