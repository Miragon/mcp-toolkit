import type { ToolCaller } from "@miragon/mcp-toolkit-tool-codegen-core"
import { useEffect, useState } from "react"
import { connectMcp } from "../mcp-connection.js"

export type McpStatus =
  | { state: "connecting" }
  | { state: "connected"; callTool: ToolCaller }
  | { state: "failed"; error: Error }

/**
 * Connects a browser MCP client to `url` while the component is mounted and closes it on
 * unmount (or when `url` changes). The ToolCaller exists once the handshake is done; until
 * then the generated hooks wait.
 */
export function useMcpConnection(url: string): McpStatus {
  const [settled, setSettled] = useState<{ url: string; status: McpStatus }>()

  useEffect(() => {
    let current = true
    const connecting = connectMcp(new URL(url), "tasks-react-app")
    connecting.then(
      ({ callTool }) => {
        if (current) setSettled({ url, status: { state: "connected", callTool } })
      },
      (error: unknown) => {
        const reason = error instanceof Error ? error : new Error(String(error))
        if (current) setSettled({ url, status: { state: "failed", error: reason } })
      },
    )
    return () => {
      current = false
      connecting.then((connection) => connection.close()).catch(() => undefined)
    }
  }, [url])

  // A status settled for an earlier url is stale: the new connection is still on its way.
  return settled?.url === url ? settled.status : { state: "connecting" }
}
