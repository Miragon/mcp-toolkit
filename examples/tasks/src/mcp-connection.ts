/**
 * The one piece of transport code in the example: an MCP SDK client over streamable HTTP, turned
 * into the `ToolCaller` the generated code runs on. The same code runs in Node (node-client.ts)
 * and in the browser (react/mcp.ts); the generated client and hooks never see the transport.
 */
import { toolCallerFromClient, type ToolCaller } from "@miragon/mcp-toolkit-tool-codegen-core"
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client"

export interface McpConnection {
  callTool: ToolCaller
  close(): Promise<void>
}

/** Connects to the MCP server at `url` (initialize handshake included). */
export async function connectMcp(url: URL, clientName: string): Promise<McpConnection> {
  const client = new Client({ name: clientName, version: "0.0.0" })
  await client.connect(new StreamableHTTPClientTransport(url))
  return { callTool: toolCallerFromClient(client), close: () => client.close() }
}
