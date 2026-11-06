import path from "node:path"
import { checkCodegenOutput, fetchTools, renderCodegen } from "@miragon/mcp-toolkit-tool-codegen"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { startTasksServer, type RunningServer } from "./support/tasks-server.js"

const CONFIG_FILE = path.resolve(import.meta.dirname, "../codegen.config.ts")

/**
 * The drift gate: `pnpm generate:check` without a running server. The tools come from the
 * server's code, booted in this process, and the generation must equal the committed files as
 * `generate --check` compares them: byte for byte but the `// Source:` line, which names the
 * server's origin. When it fails, run `pnpm serve` and `pnpm generate`, and commit the result.
 */
describe("the committed generated client", () => {
  let server: RunningServer

  beforeAll(async () => {
    server = await startTasksServer()
  })

  afterAll(async () => {
    await server?.close()
  })

  it("equals a fresh generation from the server", async () => {
    const { default: config } = await import("../codegen.config.js")
    const result = await renderCodegen(await fetchTools({ url: server.url.href }), config)

    const outDir = path.resolve(path.dirname(CONFIG_FILE), config.out)
    expect(await checkCodegenOutput(result, outDir)).toEqual([])
  })
})
