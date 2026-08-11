import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { pathToFileURL } from "node:url"
import { describe, expect, it } from "vitest"
import { isEntryPoint, parseArgs } from "./cli.js"

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

  it("ignores inherited Object.prototype keys (the dispatch table's own trap)", () => {
    for (const inherited of ["__proto__", "constructor", "toString", "valueOf"]) {
      expect(parseArgs(["generate", inherited, "--config", "cfg"])).toEqual({
        command: "generate",
        config: "cfg",
        check: false,
      })
    }
  })
})

describe("isEntryPoint", () => {
  const url = (p: string) => pathToFileURL(p).href

  it("matches when argv[1] is a symlink to the module (npm/pnpm bin links)", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "codegen-entry-"))
    try {
      const real = path.join(await fs.realpath(dir), "cli.js")
      await fs.writeFile(real, "")
      const link = path.join(dir, "cli-link.js")
      await fs.symlink(real, link)
      // The unresolved comparison returns false here — that made every
      // installed CLI (and this repo's generate/generate:check) a no-op.
      expect(isEntryPoint(link, url(real))).toBe(true)
    } finally {
      await fs.rm(dir, { recursive: true, force: true })
    }
  })

  it("does not match a different module", () => {
    expect(isEntryPoint("/tmp/other.js", url("/tmp/cli.js"))).toBe(false)
  })

  it("is false without an entry path (imported, not executed)", () => {
    expect(isEntryPoint(undefined, url("/tmp/cli.js"))).toBe(false)
  })

  it("falls back to the raw path when it cannot be resolved", () => {
    expect(isEntryPoint("/nope/missing.js", url("/nope/missing.js"))).toBe(true)
  })
})
