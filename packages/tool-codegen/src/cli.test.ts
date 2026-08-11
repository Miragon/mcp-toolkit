import { describe, expect, it } from "vitest"
import { parseArgs } from "./cli.js"

describe("parseArgs", () => {
  it("defaults to help with no command", () => {
    expect(parseArgs([])).toEqual({ command: "help", check: false })
  })

  it("ignores unknown commands (stays help)", () => {
    expect(parseArgs(["frobnicate"]).command).toBe("help")
  })

  it("parses generate with config and check", () => {
    expect(parseArgs(["generate", "--config", "./cfg.ts", "--check"])).toEqual({
      command: "generate",
      config: "./cfg.ts",
      check: true,
    })
  })

  it("accepts the short aliases", () => {
    const args = parseArgs(["inspect", "-u", "http://x/mcp", "-c", "cfg", "-o", "out", "-p", "px"])
    expect(args).toEqual({
      command: "inspect",
      upstream: "http://x/mcp",
      config: "cfg",
      out: "out",
      proxyName: "px",
      check: false,
    })
  })

  it("parses auth flags", () => {
    const args = parseArgs(["inspect", "--token", "t", "--header", "x-key", "--header-value", "v"])
    expect(args.token).toBe("t")
    expect(args.header).toBe("x-key")
    expect(args.headerValue).toBe("v")
  })

  it("--help overrides the command", () => {
    expect(parseArgs(["generate", "--help"]).command).toBe("help")
    expect(parseArgs(["inspect", "-h"]).command).toBe("help")
  })

  it("ignores unknown flags, exactly like the old switch", () => {
    expect(parseArgs(["generate", "--wat", "--config", "cfg"]).config).toBe("cfg")
  })

  it("a value-taking flag at the end yields undefined, not a crash", () => {
    expect(parseArgs(["generate", "--config"]).config).toBeUndefined()
  })
})
