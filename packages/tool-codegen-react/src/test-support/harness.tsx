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
