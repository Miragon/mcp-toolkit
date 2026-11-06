import { describe, expect, expectTypeOf, it, vi } from "vitest"
import { ToolCallError } from "./tool-call-error.js"
import { createTypedCallTool } from "./typed-call-tool.js"
import type {
  ToolCaller,
  ToolCallOptions,
  ToolCallProgress,
  ToolCallResult,
  ToolInput,
  ToolMapOf,
  ToolName,
  ToolOutput,
  ToolShape,
  TypedCallTool,
} from "./types.js"

interface AddInput {
  a: number
  b: number
}
interface AddOutput {
  sum: number
}
interface ListInput {
  filter?: string
}

/** A generated map: an interface without index signature, keyed by the server's tool names. */
interface TestMap {
  add: { input: AddInput; output: AddOutput }
  "list-items": { input: ListInput; output: string[] }
}

// The runtime hands the signal through and never reads it, so its identity is what is pinned;
// under the ES2022-only compile a plain object stands in for the platform's AbortSignal.
const signal: AbortSignal = { aborted: false }

function callerResolving(result: ToolCallResult) {
  return vi.fn<ToolCaller>(() => Promise.resolve(result))
}

describe("createTypedCallTool", () => {
  it("hands name, args and options to the caller as given", async () => {
    const callTool = callerResolving({ structuredContent: { sum: 3 } })
    const args = { a: 1, b: 2 }
    const options = { signal }

    await createTypedCallTool<TestMap>(callTool)("add", args, options)

    expect(callTool).toHaveBeenCalledExactlyOnceWith("add", args, options)
    expect(callTool.mock.calls[0]?.[1]).toBe(args)
    expect(callTool.mock.calls[0]?.[2]?.signal).toBe(signal)
  })

  it("hands the timeouts and the progress callback to the caller untouched", async () => {
    const callTool = callerResolving({ structuredContent: [] })
    const onprogress = vi.fn<NonNullable<ToolCallOptions["onprogress"]>>()
    const options: ToolCallOptions = {
      signal,
      timeout: 120_000,
      onprogress,
      resetTimeoutOnProgress: true,
      maxTotalTimeout: 600_000,
    }

    await createTypedCallTool<TestMap>(callTool)("list-items", {}, options)

    expect(callTool.mock.calls[0]?.[2]).toBe(options)
    expect(onprogress).not.toHaveBeenCalled()
  })

  it("passes no options when the call has none", async () => {
    const callTool = callerResolving({ structuredContent: [] })

    await createTypedCallTool<TestMap>(callTool)("list-items", {})

    expect(callTool).toHaveBeenCalledExactlyOnceWith("list-items", {}, undefined)
  })

  it("resolves with the decoded result", async () => {
    const callTool = callerResolving({ content: [{ type: "text", text: '["a","b"]' }] })

    await expect(
      createTypedCallTool<TestMap>(callTool)("list-items", { filter: "a" }),
    ).resolves.toEqual(["a", "b"])
  })

  it("rejects with a ToolCallError naming the tool when the tool reports a failure", async () => {
    const result = { isError: true, content: [{ type: "text", text: "a must be positive" }] }
    const call = createTypedCallTool<TestMap>(callerResolving(result))

    const failure: unknown = await call("add", { a: -1, b: 2 }).catch((error: unknown) => error)

    expect(failure).toBeInstanceOf(ToolCallError)
    expect(failure).toMatchObject({ message: "a must be positive", toolName: "add", result })
  })

  it("rejects with the caller's own error when the transport fails", async () => {
    const failure = new Error("socket hang up")
    const call = createTypedCallTool<TestMap>(() => Promise.reject(failure))

    await expect(call("add", { a: 1, b: 2 })).rejects.toBe(failure)
  })

  it("rejects instead of throwing when the caller throws synchronously", async () => {
    const failure = new Error("not connected")
    const call = createTypedCallTool<TestMap>(() => {
      throw failure
    })

    const pending = call("add", { a: 1, b: 2 })

    await expect(pending).rejects.toBe(failure)
  })
})

describe("the tool map types", () => {
  const call = createTypedCallTool<TestMap>(callerResolving({ structuredContent: null }))

  it("derives names, inputs and outputs from the map", () => {
    expectTypeOf<ToolName<TestMap>>().toEqualTypeOf<"add" | "list-items">()
    expectTypeOf<ToolInput<TestMap, "add">>().toEqualTypeOf<AddInput>()
    expectTypeOf<ToolOutput<TestMap, "list-items">>().toEqualTypeOf<string[]>()
    expectTypeOf(call).toEqualTypeOf<TypedCallTool<TestMap>>()
  })

  it("types a call by the tool it names", () => {
    expectTypeOf(call<"add">).parameters.toEqualTypeOf<
      [name: "add", args: AddInput, options?: ToolCallOptions]
    >()
    expectTypeOf(call<"add">).returns.toEqualTypeOf<Promise<AddOutput>>()
    expectTypeOf(call("list-items", {}, { signal })).toEqualTypeOf<Promise<string[]>>()
  })

  // The MCP SDK's RequestOptions, by name and type: toolCallerFromClient hands them on as they are.
  it("takes the MCP SDK's per-request options", () => {
    expectTypeOf<ToolCallOptions>().toEqualTypeOf<{
      signal?: AbortSignal
      timeout?: number
      onprogress?: (progress: ToolCallProgress) => void
      resetTimeoutOnProgress?: boolean
      maxTotalTimeout?: number
    }>()
    expectTypeOf<ToolCallProgress>().toEqualTypeOf<{
      progress: number
      total?: number
      message?: string
    }>()
    void call(
      "list-items",
      {},
      { timeout: 1, onprogress: ({ progress, total, message }) => [progress, total, message] },
    )
    // @ts-expect-error the timeout is milliseconds, a number
    void call("list-items", {}, { timeout: "60s" })
    // @ts-expect-error an option the SDK does not know
    void call("list-items", {}, { retries: 3 })
  })

  it("rejects a tool name the map does not list", () => {
    expectTypeOf<"remove">().not.toExtend<ToolName<TestMap>>()
    // @ts-expect-error "remove" is no tool of TestMap
    void call("remove", {})
    // @ts-expect-error tool names are exact: no case folding
    void call("Add", { a: 1, b: 2 })
  })

  it("rejects args that do not fit the named tool's input", () => {
    expectTypeOf<{ filter: string }>().not.toExtend<ToolInput<TestMap, "add">>()
    // @ts-expect-error a must be a number
    void call("add", { a: "1", b: 2 })
    // @ts-expect-error b is required
    void call("add", { a: 1 })
    // @ts-expect-error add takes no c
    void call("add", { a: 1, b: 2, c: 3 })
    // @ts-expect-error the input of list-items is not the input of add
    void call("add", { filter: "x" })
  })

  it("rejects a map with an index signature, whose keys would admit any tool name", () => {
    interface LegacyMap extends Record<string, ToolShape> {
      add: { input: AddInput; output: AddOutput }
    }
    interface NumericMap {
      [index: number]: ToolShape
      add: { input: AddInput; output: AddOutput }
    }
    expectTypeOf<LegacyMap>().not.toExtend<ToolMapOf<LegacyMap>>()
    expectTypeOf<NumericMap>().not.toExtend<ToolMapOf<NumericMap>>()
    // @ts-expect-error the 2.x map shape: a typo like "ad" would compile against it
    createTypedCallTool<LegacyMap>(callerResolving({}))
    // @ts-expect-error Record<string, ToolShape> names no tool, only string
    createTypedCallTool<Record<string, ToolShape>>(callerResolving({}))
    // @ts-expect-error a numeric index signature widens the keys just the same
    createTypedCallTool<NumericMap>(callerResolving({}))
    expectTypeOf<TestMap>().toExtend<ToolMapOf<TestMap>>()
    expectTypeOf<Record<never, never>>().toExtend<ToolMapOf<Record<never, never>>>()
  })

  it("rejects a map entry that is not a tool shape", () => {
    interface Broken {
      add: { input: AddInput }
    }
    expectTypeOf<Broken>().not.toExtend<ToolMapOf<Broken>>()
    // @ts-expect-error every entry needs an input and an output
    createTypedCallTool<Broken>(callerResolving({}))
  })
})
