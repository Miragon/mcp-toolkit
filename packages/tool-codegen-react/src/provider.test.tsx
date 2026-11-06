import type { ToolCaller } from "@miragon/mcp-toolkit-tool-codegen-core"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { act, renderHook, waitFor } from "@testing-library/react"
import type { ReactNode } from "react"
import { describe, expect, it, vi } from "vitest"
import {
  isNoToolCallerError,
  NoToolCallerError,
  ToolCallerProvider,
  useToolCaller,
} from "./provider.js"
import { structured } from "./test-support/harness.js"
import { useToolMutation } from "./use-tool-mutation.js"
import { useToolQuery } from "./use-tool-query.js"

function withCaller(callTool: ToolCaller | null | undefined) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <ToolCallerProvider callTool={callTool}>{children}</ToolCallerProvider>
  }
}

/** Every server of these tests lists a tool named "add": the case that must not mix them up. */
interface AddMap {
  add: { input: Record<string, never>; output: string }
}

function answering(server: string) {
  return vi.fn<ToolCaller>(() => Promise.resolve(structured(server)))
}

describe("useToolCaller", () => {
  it("returns the caller of the nearest provider", () => {
    const outer = vi.fn<ToolCaller>()
    const inner = vi.fn<ToolCaller>()
    const { result } = renderHook(() => useToolCaller(), {
      wrapper: ({ children }) => (
        <ToolCallerProvider callTool={outer}>
          <ToolCallerProvider callTool={inner}>{children}</ToolCallerProvider>
        </ToolCallerProvider>
      ),
    })

    expect(result.current).toBe(inner)
  })

  it.each([null, undefined])("returns null while the provider's caller is %s", (callTool) => {
    const { result } = renderHook(() => useToolCaller(), { wrapper: withCaller(callTool) })

    expect(result.current).toBeNull()
  })

  it("throws outside any provider, naming the provider to render", () => {
    // React reports the render error on the console before rethrowing it.
    vi.spyOn(console, "error").mockImplementation(() => {})

    expect(() => renderHook(() => useToolCaller())).toThrow(
      "useToolCaller, useToolQuery and useToolMutation need a <ToolCallerProvider> above them: " +
        "render it inside your QueryClientProvider and pass it the callTool function.",
    )
  })
})

describe("useToolCaller with namespaces", () => {
  const a = vi.fn<ToolCaller>()
  const b = vi.fn<ToolCaller>()
  const fallback = vi.fn<ToolCaller>()

  it.each([
    ["a outside b", "a", "b"],
    ["b outside a", "b", "a"],
  ])("returns each namespace its own caller, with %s", (_label, outer, inner) => {
    const callers: Record<string, ToolCaller> = { a, b }
    const { result } = renderHook(() => [useToolCaller("a"), useToolCaller("b")], {
      wrapper: ({ children }) => (
        <ToolCallerProvider namespace={outer} callTool={callers[outer]}>
          <ToolCallerProvider namespace={inner} callTool={callers[inner]}>
            {children}
          </ToolCallerProvider>
        </ToolCallerProvider>
      ),
    })

    expect(result.current).toEqual([a, b])
  })

  it("serves every other namespace from a provider without one, and a named one wins over it", () => {
    const { result } = renderHook(() => [useToolCaller("a"), useToolCaller("c"), useToolCaller()], {
      wrapper: ({ children }) => (
        <ToolCallerProvider namespace="a" callTool={a}>
          <ToolCallerProvider callTool={fallback}>{children}</ToolCallerProvider>
        </ToolCallerProvider>
      ),
    })

    expect(result.current).toEqual([a, fallback, fallback])
  })

  it("returns null for a named namespace whose caller is not ready, never the fallback", () => {
    const { result } = renderHook(() => useToolCaller("a"), {
      wrapper: ({ children }) => (
        <ToolCallerProvider callTool={fallback}>
          <ToolCallerProvider namespace="a" callTool={null}>
            {children}
          </ToolCallerProvider>
        </ToolCallerProvider>
      ),
    })

    expect(result.current).toBeNull()
  })

  it("throws for a namespace no provider names when none serves the rest, naming it", () => {
    vi.spyOn(console, "error").mockImplementation(() => {})

    expect(() =>
      renderHook(() => useToolCaller("billing"), {
        wrapper: ({ children }) => (
          <ToolCallerProvider namespace="tasks" callTool={a}>
            {children}
          </ToolCallerProvider>
        ),
      }),
    ).toThrow(
      'need a <ToolCallerProvider namespace="billing"> (or one without a namespace) above them',
    )
  })

  function twoServers(serverA: ToolCaller, serverB: ToolCaller) {
    const queryClient = new QueryClient()
    return function Wrapper({ children }: { children: ReactNode }) {
      return (
        <QueryClientProvider client={queryClient}>
          <ToolCallerProvider namespace="a" callTool={serverA}>
            <ToolCallerProvider namespace="b" callTool={serverB}>
              {children}
            </ToolCallerProvider>
          </ToolCallerProvider>
        </QueryClientProvider>
      )
    }
  }

  it("routes the mutations of two servers with the same tool name to their own server", async () => {
    const serverA = answering("A")
    const serverB = answering("B")
    const { result } = renderHook(
      () => ({
        a: useToolMutation<AddMap, "add">("a", "add"),
        b: useToolMutation<AddMap, "add">("b", "add"),
      }),
      { wrapper: twoServers(serverA, serverB) },
    )

    expect(await act(() => result.current.a.mutateAsync({}))).toBe("A")
    expect(await act(() => result.current.b.mutateAsync({}))).toBe("B")
    expect([serverA.mock.calls.length, serverB.mock.calls.length]).toEqual([1, 1])
  })

  it("routes the queries of two servers with the same tool name to their own server", async () => {
    const serverA = answering("A")
    const serverB = answering("B")
    const { result } = renderHook(
      () => ({
        a: useToolQuery<AddMap, "add">("a", "add", {}),
        b: useToolQuery<AddMap, "add">("b", "add", {}),
      }),
      { wrapper: twoServers(serverA, serverB) },
    )

    await waitFor(() => {
      expect([result.current.a.data, result.current.b.data]).toEqual(["A", "B"])
    })
    expect([serverA.mock.calls.length, serverB.mock.calls.length]).toEqual([1, 1])
  })
})

describe("NoToolCallerError", () => {
  const BRAND = Symbol.for("@miragon/mcp-toolkit-tool-codegen-react/NoToolCallerError")

  it("names the tool that could not be called", () => {
    const error = new NoToolCallerError("create_task")

    expect(error).toBeInstanceOf(Error)
    expect(error).toMatchObject({
      name: "NoToolCallerError",
      toolName: "create_task",
      message: 'Cannot call tool "create_task": the ToolCallerProvider has no callTool yet',
    })
  })

  it("is recognised, also from another copy of the package, which instanceof misses", () => {
    const foreign = Object.defineProperty(new Error("from another copy"), BRAND, { value: true })

    expect(isNoToolCallerError(new NoToolCallerError("t"))).toBe(true)
    expect(foreign).not.toBeInstanceOf(NoToolCallerError)
    expect(isNoToolCallerError(foreign)).toBe(true)
  })

  it.each([
    ["a plain Error", new Error("boom")],
    [
      "an error named NoToolCallerError",
      Object.assign(new Error("x"), { name: "NoToolCallerError" }),
    ],
    ["a non-true brand", { [BRAND]: "yes" }],
    ["null", null],
    ["undefined", undefined],
    ["a string", "NoToolCallerError"],
  ])("is not recognised in %s", (_, value) => {
    expect(isNoToolCallerError(value)).toBe(false)
  })
})
