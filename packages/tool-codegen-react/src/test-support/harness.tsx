import type { ToolCaller, ToolCallResult } from "@miragon/mcp-toolkit-tool-codegen-core"
import { QueryClient, QueryClientProvider, type DefaultOptions } from "@tanstack/react-query"
import { renderHook } from "@testing-library/react"
import type { ReactNode } from "react"
import { ToolCallerProvider } from "../provider.js"

export interface Task {
  id: string
  title: string
}

/** A generated map: an interface without index signature, keyed by the server's tool names. */
export interface TestToolMap {
  get_task: { input: { id: string }; output: Task }
  list_tasks: { input: { query?: string }; output: Task[] }
  create_task: { input: { title: string }; output: Task }
}

export function structured(value: unknown): ToolCallResult {
  return { structuredContent: value }
}

export function toolError(text: string): ToolCallResult {
  return { isError: true, content: [{ type: "text", text }] }
}

/** An error as an MCP SDK client rejects with: its name, code and message, without the SDK. */
export function sdkError(name: string, code: string | number, message: string): Error {
  return Object.assign(new Error(message), { name, code })
}

/**
 * The request timeouts of the MCP SDK clients, as `@modelcontextprotocol/client` 2.3.1 and
 * `@modelcontextprotocol/sdk` 1.32.2 reject. The example's call-options test pins the v2 ones
 * against the real SDK.
 */
export const REQUEST_TIMEOUTS: [label: string, error: Error][] = [
  ["the v2 SDK's timeout", sdkError("SdkError", "REQUEST_TIMEOUT", "Request timed out")],
  [
    "the v2 SDK's maxTotalTimeout",
    sdkError("SdkError", "REQUEST_TIMEOUT", "Maximum total timeout exceeded"),
  ],
  ["the v1 SDK's timeout", sdkError("McpError", -32001, "MCP error -32001: Request timed out")],
]

/**
 * A fresh client per test. Retries are off unless a test is about retrying and passes its own
 * defaults; `gcTime: Infinity` keeps the cache from scheduling garbage collection timers.
 */
export function createQueryClient(queries: DefaultOptions["queries"] = { retry: false }) {
  return new QueryClient({ defaultOptions: { queries: { gcTime: Infinity, ...queries } } })
}

interface RenderToolHookOptions<TProps> {
  callTool: ToolCaller | null
  queryClient?: QueryClient
  initialProps?: TProps
}

/**
 * Renders a hook under a QueryClientProvider and a ToolCallerProvider. `setCaller` re-renders the
 * provider with another caller (or none); `rerender` passes the hook new props.
 */
export function renderToolHook<TResult, TProps = undefined>(
  useHook: (props: TProps) => TResult,
  { callTool, queryClient = createQueryClient(), initialProps }: RenderToolHookOptions<TProps>,
) {
  let caller = callTool
  let props = initialProps as TProps
  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <ToolCallerProvider callTool={caller}>{children}</ToolCallerProvider>
      </QueryClientProvider>
    )
  }
  const view = renderHook(useHook, { wrapper: Wrapper, initialProps: props })
  return {
    result: view.result,
    unmount: view.unmount,
    queryClient,
    rerender: (next: TProps) => {
      props = next
      view.rerender(next)
    },
    setCaller: (next: ToolCaller | null) => {
      caller = next
      view.rerender(props)
    },
  }
}
