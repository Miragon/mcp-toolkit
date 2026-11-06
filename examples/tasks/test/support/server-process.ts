import { spawn } from "node:child_process"
import path from "node:path"

// Not new URL(…, import.meta.url): under happy-dom, URL is happy-dom's, which Node's url module rejects.
const PACKAGE_DIR = path.resolve(import.meta.dirname, "../..")

export interface ServerProcess {
  /** The server's origin; its MCP endpoint is /mcp. */
  origin: string
  close(): Promise<void>
}

/**
 * `pnpm serve` as a child process on a free port, with an empty store. The DOM tests cannot boot
 * the server in their own process: happy-dom replaces fetch, Request and Headers there, and the
 * server's Node adapter builds its requests from them (and loses the Host header).
 */
export async function spawnTasksServer(): Promise<ServerProcess> {
  const child = spawn(process.execPath, ["--import", "tsx", "src/server.ts"], {
    cwd: PACKAGE_DIR,
    env: { ...process.env, PORT: "0" },
    stdio: ["ignore", "pipe", "pipe"],
  })
  // "error" without "exit": the process never started.
  const exited = new Promise<void>((resolve) => {
    child.once("exit", () => resolve())
    child.once("error", () => resolve())
  })
  const close = async () => {
    if (child.exitCode === null && child.signalCode === null) child.kill()
    await exited
  }

  let output = ""
  try {
    const port = await new Promise<string>((resolve, reject) => {
      const collect = (chunk: Buffer) => {
        output += chunk.toString()
        const listening = /listening on http:\/\/[^/]+:(\d+)\//.exec(output)
        if (listening?.[1] !== undefined) resolve(listening[1])
      }
      child.stdout.on("data", collect)
      child.stderr.on("data", collect)
      child.once("error", reject)
      child.once("exit", (code, signal) => {
        reject(new Error(`the server exited (${code ?? signal}) before it listened:\n${output}`))
      })
    })
    return { origin: `http://127.0.0.1:${port}`, close }
  } catch (error) {
    await close()
    throw error
  }
}
