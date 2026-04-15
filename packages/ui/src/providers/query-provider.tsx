import { createContext, useContext, useState, type ReactNode } from "react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"

type CallToolFn = (name: string, args: Record<string, unknown>) => Promise<unknown>

const CallToolContext = createContext<CallToolFn | undefined>(undefined)

const QueryClientContext = createContext<{ client: QueryClient; scope?: string } | undefined>(
  undefined,
)

export function AppQueryProvider({
  children,
  callTool,
  client: externalClient,
  scope,
}: {
  children: ReactNode
  callTool?: CallToolFn
  client?: QueryClient
  scope?: string
}) {
  const [internalClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            refetchOnWindowFocus: false,
          },
        },
      }),
  )
  const client = externalClient ?? internalClient

  return (
    <QueryClientContext.Provider value={{ client, scope }}>
      <QueryClientProvider client={client}>
        <CallToolContext.Provider value={callTool}>{children}</CallToolContext.Provider>
      </QueryClientProvider>
    </QueryClientContext.Provider>
  )
}

export function useCallTool(): CallToolFn | undefined {
  return useContext(CallToolContext)
}

export function useAppQueryClient(): { client: QueryClient; scope?: string } | undefined {
  return useContext(QueryClientContext)
}
