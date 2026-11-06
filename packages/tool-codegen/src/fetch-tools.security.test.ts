/**
 * What the MCP client SDK prints while the tools are fetched is the server's text too: in the
 * 2026-07-28 era, listTools drops a tool whose x-mcp-header declaration is invalid and prints the
 * tool's raw name and the declaration with console.warn. Neither may start a line of a CI log.
 */
import http from "node:http"
import type { AddressInfo } from "node:net"
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client"
import type * as Sdk from "@modelcontextprotocol/client"
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type MockInstance,
} from "vitest"
import { fetchTools, withSdkOutputCleaned } from "./fetch-tools.js"

const sdk = vi.hoisted(() => ({ forceModern: false }))

// The SDK with its default negotiation mode flipped to "auto", the one-line change it announces;
// with `forceModern`, the 2026-07-28 era is negotiated whatever the caller asks for.
vi.mock("@modelcontextprotocol/client", async (importOriginal) => {
  const original = await importOriginal<typeof Sdk>()
  type Parameters = ConstructorParameters<typeof original.Client>
  class Client extends original.Client {
    constructor(info: Parameters[0], options?: Parameters[1]) {
      const negotiation = options?.versionNegotiation
      const mode = sdk.forceModern ? "auto" : (negotiation?.mode ?? "auto")
      super(info, { ...options, versionNegotiation: { ...negotiation, mode } })
    }
  }
  return { ...original, Client }
})

const METHODS = ["debug", "error", "info", "log", "trace", "warn"] as const
type Method = (typeof METHODS)[number]
type Print = (...data: unknown[]) => void

/** The console's printing methods by name, as the SDK calls them. */
const printing: Record<Method, Print> = console

/** Silences the console's printing methods in each test of the block; their spies. */
function spyOnConsole(): Record<Method, MockInstance<Print>> {
  const spies = {} as Record<Method, MockInstance<Print>>
  beforeEach(() => {
    for (const method of METHODS) {
      spies[method] = vi.spyOn(printing, method).mockImplementation(() => undefined)
    }
    return () => {
      for (const method of METHODS) spies[method].mockRestore()
    }
  })
  return spies
}

const HOSTILE_NAME = "evil\n::error file=src/main.ts::pwned"
const HOSTILE_HEADER = "x\n::warning::rotate the key‮"

const TOOLS = [
  { name: "ok", inputSchema: { type: "object" } },
  {
    name: HOSTILE_NAME,
    inputSchema: {
      type: "object",
      properties: { key: { type: "string", "x-mcp-header": HOSTILE_HEADER } },
    },
  },
]

interface RpcMessage {
  id?: number | string
  method: string
  params?: { protocolVersion?: string }
}

/** The result of a server that speaks both eras; undefined for a method it does not know. */
function resultOf({ method, params }: RpcMessage): Record<string, unknown> | undefined {
  if (method === "server/discover") {
    return { supportedVersions: ["2026-07-28"], capabilities: { tools: {} } }
  }
  if (method === "initialize") {
    return {
      protocolVersion: params?.protocolVersion,
      capabilities: { tools: {} },
      serverInfo: { name: "both-eras", version: "0.0.0" },
    }
  }
  // resultType, ttlMs and cacheScope are 2026-07-28 fields; a 2025 client ignores them.
  if (method === "tools/list") {
    return { tools: TOOLS, resultType: "complete", ttlMs: 0, cacheScope: "private" }
  }
  return undefined
}

/** A stateless MCP server answering in JSON: 2026-07-28 to server/discover, 2025 to initialize. */
async function startBothErasServer(): Promise<{ url: string; close(): Promise<void> }> {
  const server = http.createServer((request, response) => {
    let body = ""
    request.on("data", (chunk: Buffer) => (body += chunk.toString()))
    request.on("end", () => {
      if (request.method !== "POST") return void response.writeHead(405).end()
      const message = JSON.parse(body) as RpcMessage
      if (message.id === undefined) return void response.writeHead(202).end()
      const result = resultOf(message)
      const reply =
        result === undefined ? { error: { code: -32601, message: "Method not found" } } : { result }
      response
        .writeHead(200, { "content-type": "application/json" })
        .end(JSON.stringify({ jsonrpc: "2.0", id: message.id, ...reply }))
    })
  })
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
  const { port } = server.address() as AddressInfo
  return {
    url: `http://127.0.0.1:${port}/mcp`,
    close: () => new Promise((resolve) => server.close(() => resolve())),
  }
}

/** Every line printed through `spy`. */
function printedLines(spy: MockInstance<Print>): string[] {
  return spy.mock.calls.flatMap((data) =>
    data
      .map(String)
      .join(" ")
      .split(/\r\n?|\n/),
  )
}

const INVISIBLE = /[\p{Cc}\p{Cf}\p{Cs}\p{Zl}\p{Zp}\p{Default_Ignorable_Code_Point}]/u

describe("what the MCP client SDK prints during the fetch", { timeout: 30_000 }, () => {
  const spies = spyOnConsole()
  let server: Awaited<ReturnType<typeof startBothErasServer>>

  beforeAll(async () => {
    server = await startBothErasServer()
  })

  afterAll(async () => {
    await server?.close()
  })

  beforeEach(() => {
    sdk.forceModern = false
  })

  it("is the raw server text in the 2026-07-28 era (the control)", async () => {
    const client = new Client({ name: "control", version: "0.0.0" })
    try {
      await client.connect(new StreamableHTTPClientTransport(new URL(server.url)))
      expect(client.getProtocolEra()).toBe("modern")
      const { tools } = await client.listTools()
      expect(tools.map((tool) => tool.name)).toEqual(["ok"])
    } finally {
      await client.close()
    }
    expect(spies.warn).toHaveBeenCalledExactlyOnceWith(expect.stringContaining(HOSTILE_NAME))
    expect(spies.warn).toHaveBeenCalledExactlyOnceWith(expect.stringContaining(HOSTILE_HEADER))
  })

  it("is nothing: fetchTools speaks the 2025 protocol, also once the SDK's default flips", async () => {
    const tools = await fetchTools({ url: server.url })
    expect(tools.map((tool) => tool.name)).toEqual(["ok", HOSTILE_NAME])
    for (const method of METHODS) expect(spies[method]).not.toHaveBeenCalled()
  })

  it("reaches stderr cleaned, each line after the first marked, should 2026-07-28 be negotiated", async () => {
    sdk.forceModern = true
    const tools = await fetchTools({ url: server.url })
    expect(tools.map((tool) => tool.name)).toEqual(["ok"])

    expect(spies.warn).toHaveBeenCalledOnce()
    expect(printedLines(spies.warn)).toEqual([
      "mcp-tool-codegen: [mcp-sdk] excluding tool 'evil",
      "  | ::error file=src/main.ts::pwned' from tools/list: invalid x-mcp-header declaration — key: x-mcp-header 'x",
      "  | ::warning::rotate the key ' is not a valid RFC 9110 token (no spaces, control characters or HTTP delimiters)",
    ])
    expect(printedLines(spies.warn).filter((line) => INVISIBLE.test(line))).toEqual([])
    for (const method of METHODS.filter((name) => name !== "warn")) {
      expect(spies[method]).not.toHaveBeenCalled()
    }
  })
})

describe("withSdkOutputCleaned", () => {
  const spies = spyOnConsole()

  it("routes every printing console method to console.warn, formatted and cleaned", async () => {
    await withSdkOutputCleaned(async () => {
      await Promise.resolve()
      printing.debug("debug %s", "line\n::error::one")
      printing.error("error", { at: 1 })
      printing.info("info\u001b[2J")
      printing.log("log")
      printing.trace("trace")
      printing.warn("warn")
    })
    expect(spies.warn.mock.calls).toEqual([
      ["mcp-tool-codegen: debug line\n  | ::error::one"],
      ["mcp-tool-codegen: error { at: 1 }"],
      ["mcp-tool-codegen: info [2J"],
      ["mcp-tool-codegen: log"],
      ["mcp-tool-codegen: trace"],
      ["mcp-tool-codegen: warn"],
    ])
    for (const method of METHODS.filter((name) => name !== "warn")) {
      expect(spies[method]).not.toHaveBeenCalled()
    }
  })

  it("leaves output outside the fetch's async context alone while a fetch runs", async () => {
    let release = (): void => undefined
    const fetching = withSdkOutputCleaned(() => new Promise<void>((resolve) => (release = resolve)))
    printing.log("outside\n::error::raw")
    release()
    await fetching
    expect(spies.log).toHaveBeenCalledExactlyOnceWith("outside\n::error::raw")
    expect(spies.warn).not.toHaveBeenCalled()
  })

  it("restores the console once the last of overlapping fetches ends, a failed one too", async () => {
    const before = METHODS.map((method) => printing[method])
    let release = (): void => undefined
    const first = withSdkOutputCleaned(() => new Promise<void>((resolve) => (release = resolve)))
    const second = withSdkOutputCleaned(() => Promise.reject(new Error("refused")))
    await expect(second).rejects.toThrow("refused")
    expect(METHODS.filter((method, at) => printing[method] === before[at])).toEqual([])
    release()
    await first
    expect(METHODS.map((method) => printing[method])).toEqual(before)
  })

  it("keeps a console method replaced during the fetch", async () => {
    const spied = printing.error
    const replacement = vi.fn<Print>()
    await withSdkOutputCleaned(async () => {
      printing.error = replacement
      await Promise.resolve()
    })
    expect(printing.error).toBe(replacement)
    expect(printing.warn).toBe(spies.warn)
    printing.error = spied
  })

  it("returns what the fetch returns", async () => {
    await expect(withSdkOutputCleaned(() => Promise.resolve(42))).resolves.toBe(42)
  })
})
