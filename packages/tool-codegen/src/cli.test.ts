import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { pathToFileURL } from "node:url"
import { describe, expect, it } from "vitest"
import { isEntryPoint, loadHint, parseArgs, runCli, UsageError, type CliIo } from "./cli.js"

describe("parseArgs", () => {
  it("parses generate with its defaults and flags", () => {
    expect(parseArgs(["generate"])).toEqual({
      command: "generate",
      config: "codegen.config.ts",
      check: false,
    })
    expect(parseArgs(["generate", "--check", "--config", "./cfg.mjs"])).toEqual({
      command: "generate",
      config: "./cfg.mjs",
      check: true,
    })
  })

  it("parses inspect with each auth form", () => {
    expect(parseArgs(["inspect", "--url", "http://x/mcp"])).toEqual({
      command: "inspect",
      url: "http://x/mcp",
      auth: { mode: "none" },
    })
    expect(parseArgs(["inspect", "--url", "http://x/mcp", "--token", "-t0k"])).toEqual({
      command: "inspect",
      url: "http://x/mcp",
      auth: { mode: "bearer", token: "-t0k" },
    })
    expect(
      parseArgs(["inspect", "--header", "X-Key", "--header-value", "v", "--url", "http://x/mcp"]),
    ).toEqual({
      command: "inspect",
      url: "http://x/mcp",
      auth: { mode: "header", headerName: "X-Key", value: "v" },
    })
  })

  it("parses help in every spelling, also as a flag of a command", () => {
    for (const argv of [["help"], ["--help"], ["-h"], ["generate", "--help"], ["inspect", "-h"]]) {
      expect(parseArgs(argv)).toEqual({ command: "help" })
    }
  })

  it.each([
    [[], "missing command"],
    [["frobnicate"], 'unknown command "frobnicate"'],
    [["help", "generate"], 'unexpected argument "generate"'],
    [["generate", "--wat"], 'unknown flag "--wat" for generate'],
    [["generate", "--url", "http://x"], 'unknown flag "--url" for generate'],
    [["generate", "-c", "cfg"], 'unknown flag "-c" for generate (3.0 renamed it to --config)'],
    [
      ["inspect", "--upstream", "u"],
      'unknown flag "--upstream" for inspect (3.0 renamed it to --url)',
    ],
    [["inspect", "-u", "u"], 'unknown flag "-u" for inspect (3.0 renamed it to --url)'],
    [
      ["generate", "-o", "out"],
      'unknown flag "-o" for generate (3.0 dropped it: out is set in the config)',
    ],
    [
      ["generate", "--out", "out"],
      'unknown flag "--out" for generate (3.0 dropped it: out is set in the config)',
    ],
    [
      ["generate", "--proxy", "x"],
      'unknown flag "--proxy" for generate (3.0 dropped it: name is set in the config)',
    ],
    [
      ["generate", "-p", "x"],
      'unknown flag "-p" for generate (3.0 dropped it: name is set in the config)',
    ],
    [["generate", "--config=cfg"], 'unknown flag "--config=cfg" for generate'],
    [["generate", "cfg.ts"], 'unexpected argument "cfg.ts"'],
    [["generate", "--config"], "--config needs a value"],
    [["generate", "--config", "--check"], "--config needs a value"],
    [["generate", "--check", "--check"], "--check is given twice"],
    [["inspect", "--check"], 'unknown flag "--check" for inspect'],
    [["inspect"], "inspect needs --url <url>"],
    [
      ["inspect", "--url", "http://x/mcp", "--token", "t", "--header", "h", "--header-value", "v"],
      "use either --token or --header with --header-value, not both",
    ],
    [
      ["inspect", "--url", "http://x/mcp", "--token", "t", "--header-value", "v"],
      "use either --token or --header with --header-value, not both",
    ],
    [
      ["inspect", "--url", "http://x/mcp", "--header", "h"],
      "--header and --header-value go together",
    ],
    [
      ["inspect", "--url", "http://x/mcp", "--header-value", "v"],
      "--header and --header-value go together",
    ],
    [["inspect", "--url", "x/mcp"], "--url must be an http(s) URL"],
    [["inspect", "--url", "ftp://x/mcp"], "--url must be an http(s) URL"],
    [
      ["inspect", "--url", "http://user:S3CRET@x/mcp"],
      "--url must not carry credentials: pass them with --token or --header",
    ],
    [
      ["inspect", "--url", "http://x/mcp", "--header", "bad name", "--header-value", "v"],
      "--header must be a valid header name",
    ],
    [
      ["inspect", "--url", "http://x/mcp", "--token", "S3CRET\nX-Injected: 1"],
      "--token must not contain line breaks, control characters or characters beyond Latin-1",
    ],
    [
      ["inspect", "--url", "http://x/mcp", "--header", "X-Key", "--header-value", "S3CRET\u0000"],
      "--header-value must not contain line breaks, control characters or characters beyond Latin-1",
    ],
    [["generate", "__proto__"], 'unexpected argument "__proto__"'],
    [["generate", "constructor"], 'unexpected argument "constructor"'],
  ])("rejects %j: %s", (argv, message) => {
    expect(() => parseArgs(argv)).toThrow(new UsageError(message))
  })
})

function captureIo(cwd = process.cwd()): CliIo & { stdout: string[]; stderr: string[] } {
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

describe("runCli", () => {
  it("prints the help on stdout and exits 0", async () => {
    const io = captureIo()
    expect(await runCli(["help"], io)).toBe(0)
    expect(io.stdout.join("\n")).toContain("mcp-tool-codegen generate [--config <path>] [--check]")
    expect(io.stderr).toEqual([])
  })

  it("exits 2 with the usage for a usage error", async () => {
    const io = captureIo()
    expect(await runCli(["generate", "--wat"], io)).toBe(2)
    expect(io.stderr.join("\n")).toMatch(
      /^mcp-tool-codegen: unknown flag "--wat" for generate\n\nUsage:\n/,
    )
    expect(io.stdout).toEqual([])
  })

  it("exits 1 when the config file is missing, naming it", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "codegen-cli-"))
    try {
      const io = captureIo(dir)
      expect(await runCli(["generate"], io)).toBe(1)
      expect(io.stderr).toEqual([
        `mcp-tool-codegen: config file not found: ${path.join(dir, "codegen.config.ts")}`,
      ])
    } finally {
      await fs.rm(dir, { recursive: true, force: true })
    }
  })

  // fetch would refuse both and print the secret in its error.
  it("exits 1 for credentials in the url or a broken token, never printing the secret", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "codegen-cli-"))
    try {
      const configs = {
        "userinfo.mjs": { name: "t", url: "http://user:S3CRET@localhost/mcp", out: "o" },
        "token.mjs": {
          name: "t",
          url: "http://localhost/mcp",
          out: "o",
          auth: { mode: "bearer", token: "S3CRET\nX-Injected: 1" },
        },
        "header.mjs": {
          name: "t",
          url: "http://localhost/mcp",
          out: "o",
          headers: { "x-key": "S3CRET\u0000" },
        },
      }
      const io = captureIo(dir)
      for (const [file, config] of Object.entries(configs)) {
        await fs.writeFile(path.join(dir, file), `export default ${JSON.stringify(config)}\n`)
        expect(await runCli(["generate", "--config", file], io)).toBe(1)
      }
      expect(io.stderr).toHaveLength(3)
      expect(io.stderr.join("\n")).not.toContain("S3CRET")
      expect(io.stderr[0]).toContain(`"url" must not carry credentials: put them into "auth"`)
      expect(io.stderr[1]).toContain(`"auth" token must not contain line breaks`)
      expect(io.stderr[2]).toContain(`"headers" entry "x-key" must not contain line breaks`)
    } finally {
      await fs.rm(dir, { recursive: true, force: true })
    }
  })

  // A server's HTTP error body reaches the message: in CI, a line of it starting with "::error"
  // would be a GitHub Actions command, and a fake "up to date" would read like the CLI's own.
  it("prints an error on lines no server text can start, capped in length", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "codegen-cli-"))
    try {
      const body =
        "upstream unavailable ##[add-mask]key\n::error file=src/main.ts::rotate it\r\nup to date: 3 tools"
      await fs.writeFile(path.join(dir, "throws.mjs"), `throw new Error(${JSON.stringify(body)})\n`)
      await fs.writeFile(path.join(dir, "long.mjs"), `throw new Error("x".repeat(5000))\n`)
      const io = captureIo(dir)
      expect(await runCli(["generate", "--config", "throws.mjs"], io)).toBe(1)
      expect(await runCli(["generate", "--config", "long.mjs"], io)).toBe(1)

      const [thrown = "", long = ""] = io.stderr
      expect(thrown.split("\n")).toEqual([
        `mcp-tool-codegen: cannot load ${path.join(dir, "throws.mjs")}: upstream unavailable ## [add-mask]key`,
        "  | ::error file=src/main.ts::rotate it",
        "  | up to date: 3 tools",
      ])
      expect(long.endsWith("... (truncated)")).toBe(true)
      expect(long.length).toBeLessThan(2200)
    } finally {
      await fs.rm(dir, { recursive: true, force: true })
    }
  })

  it("exits 1 for a config without a default export, or an invalid one", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "codegen-cli-"))
    try {
      await fs.writeFile(path.join(dir, "none.mjs"), "export const config = {}\n")
      await fs.writeFile(path.join(dir, "old.mjs"), 'export default { proxyName: "x", out: "o" }\n')
      await fs.writeFile(path.join(dir, "broken.mjs"), "export default {\n")
      const io = captureIo(dir)
      expect(await runCli(["generate", "--config", "none.mjs"], io)).toBe(1)
      expect(await runCli(["generate", "--config", "old.mjs"], io)).toBe(1)
      expect(await runCli(["generate", "--config", "broken.mjs"], io)).toBe(1)
      expect(io.stderr[0]).toBe(
        `mcp-tool-codegen: ${path.join(dir, "none.mjs")} has no default export`,
      )
      expect(io.stderr[1]).toContain(`  | - "proxyName" was renamed to "name" in 3.0`)
      expect(io.stderr[2]).toContain(
        `mcp-tool-codegen: cannot load ${path.join(dir, "broken.mjs")}: `,
      )
      expect(io.stderr[2]).not.toContain("CommonJS")
    } finally {
      await fs.rm(dir, { recursive: true, force: true })
    }
  })
})

describe("loadHint", () => {
  const unknownExtension = Object.assign(new TypeError("Unknown file extension"), {
    code: "ERR_UNKNOWN_FILE_EXTENSION",
  })

  it("names the Node.js version and the tsx command for a .ts config it cannot load", () => {
    expect(loadHint("/app/codegen.config.ts", unknownExtension)).toBe(
      ' (Node.js loads a .ts config from version 22.18 on; use a .mjs config, or run the CLI with NODE_OPTIONS="--import tsx")',
    )
  })

  // Node.js reads a .ts or .js file of a "type": "commonjs" package as CommonJS, where the
  // config's `export default` is a syntax error.
  it("names the .mts or .mjs config a CommonJS package needs", () => {
    const syntax = new SyntaxError("Unexpected token 'export'")
    expect(loadHint("/app/codegen.config.ts", syntax)).toBe(
      " (in a CommonJS package, name the config codegen.config.mts and pass it with --config)",
    )
    expect(loadHint("/app/tools.config.js", syntax)).toContain("name the config tools.config.mjs")
    expect(loadHint("/app/codegen.config.mjs", syntax)).toBe("")
    expect(loadHint("/app/codegen.config.ts", new Error("Cannot find module"))).toBe("")
  })
})

describe("isEntryPoint", () => {
  const url = (file: string) => pathToFileURL(file).href

  it("matches when argv[1] is a symlink to the module (npm/pnpm bin links)", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "codegen-entry-"))
    try {
      const real = path.join(await fs.realpath(dir), "cli.js")
      await fs.writeFile(real, "")
      const link = path.join(dir, "cli-link.js")
      await fs.symlink(real, link)
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
