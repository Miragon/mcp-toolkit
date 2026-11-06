import type { ToolCallOptions, ToolShape } from "@miragon/mcp-toolkit-tool-codegen-core"
import {
  QueryClient,
  useSuspenseQuery,
  type UseMutationResult,
  type UseQueryResult,
} from "@tanstack/react-query"
import { describe, expectTypeOf, it } from "vitest"
import { toolQueryKey, type ToolQueryKeyPrefix } from "./query-key.js"
import {
  toolQueryOptions,
  type ToolQueryCallOptions,
  type ToolQueryContext,
} from "./query-options.js"
import type { Task, TestToolMap } from "./test-support/harness.js"
import { useToolMutation, type UseToolMutationOptions } from "./use-tool-mutation.js"
import { useToolQuery, type UseToolQueryOptions } from "./use-tool-query.js"

// Compile-time checks: tsc (`pnpm typecheck`) proves them, and each `@ts-expect-error` fails the
// typecheck once the line below it compiles. The `use…` functions hold call sites as an app
// writes them; nothing calls them.

describe("useToolQuery types", () => {
  it("takes the tool's input and yields its output", () => {
    expectTypeOf(useToolQuery<TestToolMap, "get_task">).toBeCallableWith("tasks", "get_task", {
      id: "1",
    })
    expectTypeOf(useToolQuery<TestToolMap, "get_task">).returns.toEqualTypeOf<
      UseQueryResult<Task, Error>
    >()
    expectTypeOf(useToolQuery<TestToolMap, "list_tasks">).returns.toEqualTypeOf<
      UseQueryResult<Task[], Error>
    >()
  })

  it("rejects unknown tools, other names, wrong args and a missing map", () => {
    function useWrongCalls() {
      // @ts-expect-error a typo is no tool of the map
      useToolQuery<TestToolMap, "get_tasks">("tasks", "get_tasks", { id: "1" })
      // @ts-expect-error list_tasks is not the tool the call was typed for
      useToolQuery<TestToolMap, "get_task">("tasks", "list_tasks", {})
      // @ts-expect-error id is a string
      useToolQuery<TestToolMap, "get_task">("tasks", "get_task", { id: 1 })
      // @ts-expect-error id is required
      useToolQuery<TestToolMap, "get_task">("tasks", "get_task", {})
      // @ts-expect-error get_task takes no title
      useToolQuery<TestToolMap, "get_task">("tasks", "get_task", { id: "1", title: "x" })
      // @ts-expect-error without the map TMap cannot be inferred, so no tool name fits
      useToolQuery("tasks", "get_task", { id: "1" })
    }
    expectTypeOf(useWrongCalls).toBeFunction()
  })

  it("types select from the output and data from select", () => {
    function useTitles() {
      return useToolQuery<TestToolMap, "list_tasks", string[]>(
        "tasks",
        "list_tasks",
        {},
        {
          select: (tasks) => {
            expectTypeOf(tasks).toEqualTypeOf<Task[]>()
            return tasks.map((task) => task.title)
          },
        },
      )
    }
    function useSelectNotMatchingTSelected() {
      return useToolQuery<TestToolMap, "list_tasks", number>(
        "tasks",
        "list_tasks",
        {},
        // @ts-expect-error select yields string[], the call declared number
        { select: (tasks) => tasks.map((task) => task.title) },
      )
    }

    expectTypeOf(useTitles).returns.toEqualTypeOf<UseQueryResult<string[], Error>>()
    expectTypeOf(useSelectNotMatchingTSelected).toBeFunction()
  })

  it("lets a wrapping hook with its own TSelected infer it from select", () => {
    // The shape a generated query hook can take: only its own type parameter is left to infer.
    function useTasksListTasksQuery<TSelected = Task[]>(
      args: TestToolMap["list_tasks"]["input"],
      options?: UseToolQueryOptions<Task[], TSelected>,
    ) {
      return useToolQuery<TestToolMap, "list_tasks", TSelected>(
        "tasks",
        "list_tasks",
        args,
        options,
      )
    }
    function useTaskCount() {
      return useTasksListTasksQuery({}, { select: (tasks) => tasks.length })
    }

    expectTypeOf(useTaskCount).returns.toEqualTypeOf<UseQueryResult<number, Error>>()
    expectTypeOf(useTasksListTasksQuery<Task[]>).returns.toEqualTypeOf<
      UseQueryResult<Task[], Error>
    >()
  })

  it("owns queryKey and queryFn", () => {
    expectTypeOf<UseToolQueryOptions<Task>>().not.toHaveProperty("queryKey")
    expectTypeOf<UseToolQueryOptions<Task>>().not.toHaveProperty("queryFn")
    expectTypeOf<UseToolQueryOptions<Task>>().toHaveProperty("enabled")
  })

  it("takes the call's options but the signal, which the query owns", () => {
    expectTypeOf<UseToolQueryOptions<Task>["callOptions"]>().toEqualTypeOf<
      Omit<ToolCallOptions, "signal"> | undefined
    >()
    function useCallOptions(signal: AbortSignal) {
      useToolQuery<TestToolMap, "get_task">(
        "tasks",
        "get_task",
        { id: "1" },
        {
          callOptions: {
            timeout: 120_000,
            onprogress: ({ progress, total, message }) => void [progress, total, message],
            resetTimeoutOnProgress: true,
            maxTotalTimeout: 600_000,
          },
        },
      )
      useToolQuery<TestToolMap, "get_task">(
        "tasks",
        "get_task",
        { id: "1" },
        // @ts-expect-error TanStack aborts the query's call; a signal of its own would not be heard
        { callOptions: { signal } },
      )
    }
    expectTypeOf(useCallOptions).toBeFunction()
  })

  it("rejects a map with an index signature, whose keys would admit any tool name", () => {
    interface LegacyMap extends Record<string, ToolShape> {
      get_task: { input: { id: string }; output: Task }
    }
    function useLegacyMaps() {
      // @ts-expect-error a 2.x map: "get_tsak" would compile against it
      useToolQuery<LegacyMap, "get_tsak">("tasks", "get_tsak", {})
      // @ts-expect-error Record<string, ToolShape> has no tool names, only string
      useToolQuery<Record<string, ToolShape>, string>("tasks", "any", {})
    }
    expectTypeOf(useLegacyMaps).toBeFunction()
  })
})

describe("query key types", () => {
  const queryClient = new QueryClient()

  it("types the key by the map and tags it with the tool's output", () => {
    const key = toolQueryKey<TestToolMap, "get_task">("tasks", "get_task", { id: "1" })
    expectTypeOf(queryClient.getQueryData(key)).toEqualTypeOf<Task | undefined>()
    function seed() {
      queryClient.setQueryData(key, { id: "1", title: "x" })
      // @ts-expect-error a key's data is the tool's output
      queryClient.setQueryData(key, 1)
    }
    expectTypeOf(seed).toBeFunction()
  })

  it("rejects an unknown tool name and wrong args", () => {
    function wrongKeys() {
      // @ts-expect-error a snake_case typo of a kebab-case tool would cache nothing
      toolQueryKey<TestToolMap, "get-task">("tasks", "get-task", { id: "1" })
      // @ts-expect-error get_task takes an id
      toolQueryKey<TestToolMap, "get_task">("tasks", "get_task", { title: "1" })
    }
    expectTypeOf(wrongKeys).toBeFunction()
  })

  it("gives toolQueryOptions the tool's output, also under useSuspenseQuery", () => {
    function useTask() {
      return useSuspenseQuery(
        toolQueryOptions<TestToolMap, "get_task">(
          "tasks",
          "get_task",
          { id: "1" },
          {
            callTool: null,
            queryClient,
          },
        ),
      ).data
    }
    expectTypeOf(useTask).returns.toEqualTypeOf<Task>()
  })

  it("takes the call's options but the signal in the context of toolQueryOptions", () => {
    expectTypeOf<ToolQueryContext["callOptions"]>().toEqualTypeOf<
      ToolQueryCallOptions | undefined
    >()
    expectTypeOf<ToolQueryCallOptions>().toEqualTypeOf<Omit<ToolCallOptions, "signal">>()
  })
})

describe("useToolMutation types", () => {
  type CreateTaskOptions = UseToolMutationOptions<TestToolMap, "create_task">

  it("takes the tool's input as variables and yields its output", () => {
    expectTypeOf(useToolMutation<TestToolMap, "create_task">).returns.toEqualTypeOf<
      UseMutationResult<Task, Error, { title: string }>
    >()
  })

  it("lets mutate() leave out the args of a tool without a required input, and only those", () => {
    function useCalls() {
      useToolMutation<TestToolMap, "list_tasks">("tasks", "list_tasks").mutate()
      // @ts-expect-error create_task needs a title
      useToolMutation<TestToolMap, "create_task">("tasks", "create_task").mutate()
    }
    expectTypeOf(useCalls).toBeFunction()
  })

  it("types the context onMutate returns in onError and onSettled", () => {
    // The shape a generated mutation hook takes: only its own type parameter is left to infer.
    function useTasksCreateTaskMutation<TOnMutateResult = unknown>(
      options?: UseToolMutationOptions<TestToolMap, "create_task", TOnMutateResult>,
    ) {
      return useToolMutation<TestToolMap, "create_task", TOnMutateResult>(
        "tasks",
        "create_task",
        options,
      )
    }
    function useOptimisticCreate() {
      return useTasksCreateTaskMutation({
        onMutate: () => ({ previous: [] as Task[] }),
        onError: (_error, _variables, context) => {
          expectTypeOf(context).toEqualTypeOf<{ previous: Task[] } | undefined>()
        },
        onSettled: (_data, _error, _variables, context) => {
          expectTypeOf(context).toEqualTypeOf<{ previous: Task[] } | undefined>()
        },
      })
    }
    expectTypeOf(useOptimisticCreate).returns.toEqualTypeOf<
      UseMutationResult<Task, Error, { title: string }, { previous: Task[] }>
    >()
  })

  it("rejects unknown tools and wrong variables", () => {
    function useWrongCalls() {
      // @ts-expect-error a typo is no tool of the map
      useToolMutation<TestToolMap, "create_tasks">("tasks", "create_tasks")
      const create = useToolMutation<TestToolMap, "create_task">("tasks", "create_task")
      // @ts-expect-error title is required
      create.mutate({})
      // @ts-expect-error create_task takes no id
      create.mutate({ title: "x", id: "1" })
    }
    expectTypeOf(useWrongCalls).toBeFunction()
  })

  it("types the caller's callbacks from the tool", () => {
    type OnSuccess = NonNullable<CreateTaskOptions["onSuccess"]>
    expectTypeOf<OnSuccess>().parameter(0).toEqualTypeOf<Task>()
    expectTypeOf<OnSuccess>().parameter(1).toEqualTypeOf<{ title: string }>()
  })

  it("owns mutationFn and invalidates false or key prefixes of the map, nothing else", () => {
    expectTypeOf<CreateTaskOptions>().not.toHaveProperty("mutationFn")
    expectTypeOf<CreateTaskOptions["invalidates"]>().toEqualTypeOf<
      false | readonly ToolQueryKeyPrefix<TestToolMap>[] | undefined
    >()
    function useInvalidations() {
      useToolMutation<TestToolMap, "create_task">("tasks", "create_task", {
        invalidates: [["other"], ["tasks", "list_tasks"], ["tasks", "get_task", { id: "1" }]],
      })
      useToolMutation<TestToolMap, "create_task">("tasks", "create_task", {
        // @ts-expect-error no tool of the map: the invalidation would match nothing
        invalidates: [["tasks", "list-tasks"]],
      })
    }
    expectTypeOf(useInvalidations).toBeFunction()
  })

  it("takes the call's options, a signal included", () => {
    expectTypeOf<CreateTaskOptions["callOptions"]>().toEqualTypeOf<ToolCallOptions | undefined>()
    function useCallOptions(signal: AbortSignal) {
      useToolMutation<TestToolMap, "create_task">("tasks", "create_task", {
        callOptions: { signal, timeout: 300_000, onprogress: ({ progress }) => void progress },
      })
      useToolMutation<TestToolMap, "create_task">("tasks", "create_task", {
        // @ts-expect-error the timeout is milliseconds, a number
        callOptions: { timeout: "5m" },
      })
    }
    expectTypeOf(useCallOptions).toBeFunction()
  })
})
