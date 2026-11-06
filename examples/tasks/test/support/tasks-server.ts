import { createTasksServer } from "../../src/server.js"

export interface RunningServer {
  /** The MCP endpoint. */
  url: URL
  close(): Promise<void>
}

/** `createTasksServer()` in this process, on a free loopback port, with an empty store. */
export async function startTasksServer(): Promise<RunningServer> {
  const server = createTasksServer()
  const { port } = await server.listen(0, { host: "127.0.0.1" })
  return { url: new URL(`http://127.0.0.1:${port}/mcp`), close: () => server.close() }
}
