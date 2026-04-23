import { createContext, useContext, type ReactNode } from "react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"

// `object` (not `Record<string, unknown>`) because generated tool input
// interfaces lack an implicit index signature and TS rejects the assignment
// otherwise. JSON args are objects either way.
type CallToolFn = (name: string, args: object) => Promise<unknown>

const CallToolContext = createContext<CallToolFn | undefined>(undefined)

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: false,
    },
  },
})

export function AppQueryProvider({
  children,
  callTool,
}: {
  children: ReactNode
  callTool?: CallToolFn
}) {
  return (
    <QueryClientProvider client={queryClient}>
      <CallToolContext.Provider value={callTool}>{children}</CallToolContext.Provider>
    </QueryClientProvider>
  )
}

export function useCallTool(): CallToolFn | undefined {
  return useContext(CallToolContext)
}

export { queryClient }
