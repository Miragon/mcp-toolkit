import { createContext, useContext, useMemo, type ReactNode } from "react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { useHostBridgeOrNull } from "../app/host-bridge.js"

// `object` (not `Record<string, unknown>`) because generated tool input
// interfaces lack an implicit index signature and TS rejects the assignment
// otherwise. JSON args are objects either way.
type CallToolFn = (name: string, args: object) => Promise<unknown>

const CallToolContext = createContext<CallToolFn | undefined>(undefined)

/** Whether the data hooks put the tool name into their cache keys (`toolQueryKey`). */
const ToolNameInQueryKeyContext = createContext(false)

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: false,
    },
  },
})

/** The client of the nearest `AppQueryProvider`, which a nested one without `client` keeps. */
const AppQueryClientContext = createContext<QueryClient>(queryClient)

/**
 * The query client and tool transport of the toolkit's data hooks.
 *
 * `callTool` is how `useToolQuery` & co. reach the server; without it they
 * fall back to the nearest `HostBridgeProvider`'s bridge (toolkit#176 N25).
 * `client` replaces the shared module-level client, e.g. one per mount;
 * omitted, a nested provider keeps its parent's client (as `McpAppView`'s
 * own provider does), and the outermost one shares the toolkit's client
 * (`queryClient`). `toolNameInQueryKey` puts the tool name into the hooks'
 * cache keys (`[...queryKey, toolName, args]`, see `toolQueryKey`), so two
 * tools never share an entry; omitted, a nested provider keeps its parent's
 * setting, and the outermost one uses the 2.x key `[...queryKey, args]`. The
 * next major makes the tool name the default.
 */
export function AppQueryProvider({
  children,
  callTool,
  client,
  toolNameInQueryKey,
}: {
  children: ReactNode
  callTool?: CallToolFn
  client?: QueryClient
  toolNameInQueryKey?: boolean
}) {
  const inheritedClient = useAppQueryClient()
  const inherited = useContext(ToolNameInQueryKeyContext)
  const effective = client ?? inheritedClient
  return (
    <AppQueryClientContext.Provider value={effective}>
      <QueryClientProvider client={effective}>
        <CallToolContext.Provider value={callTool}>
          <ToolNameInQueryKeyContext.Provider value={toolNameInQueryKey ?? inherited}>
            {children}
          </ToolNameInQueryKeyContext.Provider>
        </CallToolContext.Provider>
      </QueryClientProvider>
    </AppQueryClientContext.Provider>
  )
}

/**
 * The client an `AppQueryProvider` without `client` uses at this point: the
 * nearest `AppQueryProvider`'s, else the toolkit's shared `queryClient`. A
 * plain TanStack `QueryClientProvider` does not count.
 */
export function useAppQueryClient(): QueryClient {
  return useContext(AppQueryClientContext)
}

/**
 * Whether the nearest `AppQueryProvider` puts the tool name into the data
 * hooks' cache keys (`toolNameInQueryKey`); `false` outside one.
 */
export function useToolNameInQueryKey(): boolean {
  return useContext(ToolNameInQueryKeyContext)
}

/**
 * The tool transport of the data hooks: `AppQueryProvider`'s `callTool`,
 * else the nearest `HostBridgeProvider`'s `callTool`, else `undefined`.
 */
export function useCallTool(): CallToolFn | undefined {
  const explicit = useContext(CallToolContext)
  const bridge = useHostBridgeOrNull()
  return useMemo<CallToolFn | undefined>(() => {
    if (explicit) return explicit
    if (!bridge) return undefined
    return (name, args) => bridge.callTool(name, args as Record<string, unknown>)
  }, [explicit, bridge])
}

export { queryClient }
