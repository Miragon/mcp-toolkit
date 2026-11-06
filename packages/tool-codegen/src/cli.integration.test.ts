import fs from "node:fs/promises"
import http from "node:http"
import net, { type AddressInfo } from "node:net"
import os from "node:os"
import path from "node:path"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { runCli, type CliIo } from "./cli.js"
import { startTestServer, type TestServer } from "./test-support/server.js"

/** The CLI end to end: a config file, a real MCP server, files on disk. */

/** A free TCP port: bind port 0 and release it again. */
async function closedPort(): Promise<number> {
  return await new Promise((resolve, reject) => {
    const probe = net.createServer()
    probe.once("error", reject)
    probe.listen(0, "127.0.0.1", () => {
      const { port } = probe.address() as AddressInfo
      probe.close(() => resolve(port))
    })
  })
}

function captureIo(cwd: string): CliIo & { stdout: string[]; stderr: string[] } {
  const stdout: string[] = []
  const stderr: string[] = []
  return {
    stdout,
    stderr,
    out: (text) => stdout.push(text),
    err: (text) => stderr.push(text),
    cwd: () => cwd,
  }
}

describe("mcp-tool-codegen against a real MCP server", { timeout: 30_000 }, () => {
  let server: TestServer
  let dir: string
  let generated: string

  beforeAll(async () => {
    server = await startTestServer()
  }, 30_000)

  afterAll(async () => {
    await server?.close()
  })

  beforeEach(async () => {
    dir = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), "codegen-cli-")))
    generated = path.join(dir, "app", "src", "generated")
    await fs.mkdir(path.join(dir, "app"))
    return () => fs.rm(dir, { recursive: true, force: true })
  })

  async function writeConfig(file: string, react: boolean): Promise<void> {
    const config = { name: "tasks", url: server.url, out: "./src/generated", react }
    await fs.writeFile(path.join(dir, "app", file), `export default ${JSON.stringify(config)}\n`)
  }

  const read = (file: string) => fs.readFile(path.join(generated, file), "utf-8")

  it("generates into out, resolved against the config file's directory, not the cwd", async () => {
    await writeConfig("codegen.config.mjs", true)
    const io = captureIo(dir)
    expect(await runCli(["generate", "--config", "app/codegen.config.mjs"], io)).toBe(0)
    expect(io.stdout).toEqual([`generated 2 tools: tools.ts, hooks.tsx in ${generated}`])
    expect(await read("tools.ts")).toContain(
      "export function createTasksClient(callTool: ToolCaller)",
    )
    const hooks = await read("hooks.tsx")
    expect(hooks).toContain("export function useTasksListTasksQuery<")
    expect(hooks).toContain("export function useTasksCreateTaskMutation<")
  })

  it("loads a TypeScript config from the working directory by default", async () => {
    await fs.writeFile(
      path.join(dir, "app", "codegen.config.ts"),
      `import type { CodegenConfig } from "@miragon/mcp-toolkit-tool-codegen"\n\n` +
        `const config: CodegenConfig = { name: "tasks", url: ${JSON.stringify(server.url)}, out: "./src/generated" }\n\n` +
        "export default config\n",
    )
    const io = captureIo(path.join(dir, "app"))
    expect(await runCli(["generate"], io)).toBe(0)
    expect(await read("tools.ts")).toContain("export interface TasksToolMap {")
  })

  it("--check passes on fresh output and fails on drift of every generated file", async () => {
    await writeConfig("codegen.config.mjs", true)
    const config = ["generate", "--config", "codegen.config.mjs"]
    const io = captureIo(path.join(dir, "app"))
    expect(await runCli(config, io)).toBe(0)

    expect(await runCli([...config, "--check"], io)).toBe(0)
    expect(io.stdout.at(-1)).toBe(`up to date: 2 tools in ${generated}`)

    const tools = await read("tools.ts")
    await fs.writeFile(
      path.join(generated, "tools.ts"),
      tools.replace("Lists the tasks.", "Lists tasks."),
    )
    await fs.rm(path.join(generated, "hooks.tsx"))
    expect(await runCli([...config, "--check"], io)).toBe(1)
    expect(io.stderr).toEqual([
      expect.stringMatching(
        /^drift: tools\.ts differs from a fresh generation\n {2}- \d+: {5}\/\*\* Lists tasks\. \*\/\n {2}\+ \d+: {5}\/\*\* Lists the tasks\. \*\/$/,
      ),
      `drift: hooks.tsx is missing in ${generated}`,
      `run "mcp-tool-codegen generate" to update ${generated}`,
    ])
    // --check writes nothing
    expect(await read("tools.ts")).not.toBe(tools)
  })

  it("--check passes against the same tools at another address", async () => {
    await writeConfig("codegen.config.mjs", true)
    const io = captureIo(path.join(dir, "app"))
    expect(await runCli(["generate", "--config", "codegen.config.mjs"], io)).toBe(0)

    const elsewhere = await startTestServer()
    try {
      const config = { name: "tasks", url: elsewhere.url, out: "./src/generated", react: true }
      await fs.writeFile(
        path.join(dir, "app", "elsewhere.config.mjs"),
        `export default ${JSON.stringify(config)}\n`,
      )
      expect(await runCli(["generate", "--config", "elsewhere.config.mjs", "--check"], io)).toBe(0)
      expect(io.stderr).toEqual([])
    } finally {
      await elsewhere.close()
    }
  })

  it("reports a stale hooks.tsx once react is off, and generate removes it", async () => {
    await writeConfig("react.config.mjs", true)
    await writeConfig("plain.config.mjs", false)
    const io = captureIo(path.join(dir, "app"))
    expect(await runCli(["generate", "--config", "react.config.mjs"], io)).toBe(0)

    expect(await runCli(["generate", "--config", "plain.config.mjs", "--check"], io)).toBe(1)
    expect(io.stderr[0]).toBe(
      "drift: hooks.tsx is stale: react is off, so generate would remove it",
    )

    expect(await runCli(["generate", "--config", "plain.config.mjs"], io)).toBe(0)
    expect(io.stdout.slice(-2)).toEqual([
      `generated 2 tools: tools.ts in ${generated}`,
      "removed the stale hooks.tsx (react is off)",
    ])
    await expect(read("hooks.tsx")).rejects.toThrow("ENOENT")
    expect(await runCli(["generate", "--config", "plain.config.mjs", "--check"], io)).toBe(0)
  })

  it("exits 1 naming the server and the cause when it is unreachable", async () => {
    const port = await closedPort()
    const config = {
      name: "tasks",
      url: `http://127.0.0.1:${port}/s/S3CRET/mcp?key=S3CRET`,
      out: "./out",
    }
    await fs.writeFile(
      path.join(dir, "app", "down.config.mjs"),
      `export default ${JSON.stringify(config)}\n`,
    )
    const io = captureIo(path.join(dir, "app"))
    expect(await runCli(["generate", "--config", "down.config.mjs"], io)).toBe(1)
    expect(io.stderr).toEqual([
      `mcp-tool-codegen: cannot list the tools of http://127.0.0.1:${port}: fetch failed (ECONNREFUSED): is the server running at that address?`,
    ])
  })

  it("marks the lines of a server's error body as continuations", async () => {
    const body = "upstream unavailable\n::error file=src/main.ts::Leaked key\nup to date: 3 tools"
    const failing = http.createServer((_request, response) => {
      response.statusCode = 500
      response.end(body)
    })
    await new Promise<void>((resolve) => failing.listen(0, "127.0.0.1", resolve))
    try {
      const { port } = failing.address() as AddressInfo
      const io = captureIo(dir)
      expect(await runCli(["inspect", "--url", `http://127.0.0.1:${port}/mcp`], io)).toBe(1)
      const lines = io.stderr.join("\n").split("\n")
      expect(lines[0]).toMatch(
        /^mcp-tool-codegen: cannot list the tools of http:\/\/127\.0\.0\.1:\d+: /,
      )
      expect(lines.slice(1)).toEqual([
        "  | ::error file=src/main.ts::Leaked key",
        "  | up to date: 3 tools",
      ])
    } finally {
      await new Promise((resolve) => failing.close(resolve))
    }
  })

  it("inspect prints the tools with the hook kind codegen gives them", async () => {
    const io = captureIo(dir)
    expect(await runCli(["inspect", "--url", server.url, "--token", "t"], io)).toBe(0)
    expect(io.stdout.slice(0, 2)).toEqual([
      "| name | hook | description | input |",
      "| --- | --- | --- | --- |",
    ])
    expect(io.stdout.slice(2).sort()).toEqual([
      "| create_task | mutation | Creates a task. | title |",
      "| list_tasks | query | Lists the tasks. | status |",
    ])
    expect(server.requests.at(-1)?.authorization).toBe("Bearer t")
  })
})
