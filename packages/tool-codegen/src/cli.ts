#!/usr/bin/env node
/* eslint-disable no-console */
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { pathToFileURL } from "node:url"
import { generateTools, writeCodegenOutput, type CodegenConfig } from "./codegen.js"
import { fetchUpstreamTools, type FetchToolsOptions } from "./fetch-tools.js"

interface ParsedArgs {
  command: "generate" | "inspect" | "help"
  config?: string
  check: boolean
  upstream?: string
  token?: string
  header?: string
  headerValue?: string
  out?: string
  proxyName?: string
}

function parseArgs(argv: string[]): ParsedArgs {
  const args: ParsedArgs = { command: "help", check: false }
  const [command, ...rest] = argv
  if (command === "generate" || command === "inspect") args.command = command

  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i]
    const next = () => rest[++i]
    switch (arg) {
      case "--config":
      case "-c":
        args.config = next()
        break
      case "--check":
        args.check = true
        break
      case "--upstream":
      case "-u":
        args.upstream = next()
        break
      case "--token":
        args.token = next()
        break
      case "--header":
        args.header = next()
        break
      case "--header-value":
        args.headerValue = next()
        break
      case "--out":
      case "-o":
        args.out = next()
        break
      case "--proxy":
      case "-p":
        args.proxyName = next()
        break
      case "--help":
      case "-h":
        args.command = "help"
        break
    }
  }
  return args
}

function printHelp(): void {
  console.log(
    `mcp-tool-codegen — generate typed TS client code from an MCP server's tools/list.

Commands:
  generate [--config <path>] [--check]
      Fetch tools/list and write TypeScript + React Query hooks.
      --check    regenerate into a temp dir and exit != 0 if the output differs
                 from the committed files (for CI drift checks)
  inspect --upstream <url> [--token <bearer>] [--header <name> --header-value <v>]
      Print a markdown table of the upstream's tools without generating code.
  help
      Show this message.

Generate reads its configuration from a file (default: ./codegen.config.ts).
The config module's default export must satisfy the CodegenConfig type:

  export default {
    proxyName: "lexoffice",
    upstreamUrl: process.env.LEXOFFICE_CODEGEN_SOURCE_URL,
    auth: { mode: "bearer", token: process.env.LEXOFFICE_CODEGEN_TOKEN },
    out: "./src/generated",
  }
`,
  )
}

async function loadConfig(configPath: string): Promise<CodegenConfig> {
  const abs = path.resolve(process.cwd(), configPath)
  const mod = (await import(pathToFileURL(abs).href)) as { default?: CodegenConfig }
  if (!mod.default) {
    throw new Error(`codegen config at ${abs} has no default export`)
  }
  return mod.default
}

async function runGenerate(args: ParsedArgs): Promise<void> {
  const configPath = args.config ?? "./codegen.config.ts"
  const config = await loadConfig(configPath)
  const result = await generateTools(config)

  if (args.check) {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "mcp-tool-codegen-"))
    try {
      const clone: CodegenConfig = { ...config, out: tmp }
      await writeCodegenOutput(clone, result)
      await assertMatches(config.out, tmp)
      console.log(`OK (${result.tools.length} tools match committed output)`)
    } finally {
      await fs.rm(tmp, { recursive: true, force: true })
    }
    return
  }

  await writeCodegenOutput(config, result)
  console.log(`generated ${result.tools.length} tools → ${path.resolve(process.cwd(), config.out)}`)
}

async function assertMatches(committed: string, generated: string): Promise<void> {
  const committedAbs = path.resolve(process.cwd(), committed)
  let drifted = false
  for (const file of ["tools.ts", "hooks.tsx"]) {
    const a = await fs.readFile(path.join(committedAbs, file), "utf-8").catch(() => null)
    const b = await fs.readFile(path.join(generated, file), "utf-8")
    if (a === null) {
      console.error(`drift: ${file} missing from committed output (${committedAbs})`)
      drifted = true
      continue
    }
    if (a !== b) {
      console.error(`drift: ${file} differs from committed output`)
      printLineDiff(a, b)
      drifted = true
    }
  }
  if (drifted) process.exit(1)
}

/**
 * Prints the first N differing lines between two strings. Cheap line-level
 * diff (no LCS) — sufficient to tell the user where regeneration would
 * change the file without pulling in a diff library.
 */
function printLineDiff(committed: string, generated: string, maxLines = 20): void {
  const aLines = committed.split("\n")
  const bLines = generated.split("\n")
  const max = Math.max(aLines.length, bLines.length)
  let shown = 0
  for (let i = 0; i < max && shown < maxLines; i++) {
    const a = aLines[i]
    const b = bLines[i]
    if (a !== b) {
      if (a !== undefined) console.error(`  - ${i + 1}: ${a}`)
      if (b !== undefined) console.error(`  + ${i + 1}: ${b}`)
      shown++
    }
  }
  if (shown >= maxLines) {
    console.error(`  ... (truncated; more differences not shown)`)
  }
}

async function runInspect(args: ParsedArgs): Promise<void> {
  if (!args.upstream) {
    console.error("inspect: --upstream <url> is required")
    process.exit(1)
  }
  const auth = resolveAuthFromFlags(args)
  const tools = await fetchUpstreamTools({ upstreamUrl: args.upstream, auth })
  console.log(`| name | description | input keys |`)
  console.log(`| --- | --- | --- |`)
  for (const tool of tools) {
    const inputKeys = Object.keys(
      (tool.inputSchema.properties as Record<string, unknown> | undefined) ?? {},
    )
    const desc = (tool.description ?? "").replace(/\|/g, "\\|").replace(/\n/g, " ")
    console.log(`| ${tool.name} | ${desc} | ${inputKeys.join(", ")} |`)
  }
}

function resolveAuthFromFlags(args: ParsedArgs): FetchToolsOptions["auth"] {
  if (args.token) return { mode: "bearer", token: args.token }
  if (args.header && args.headerValue) {
    return { mode: "header", headerName: args.header, value: args.headerValue }
  }
  return { mode: "none" }
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2))
  try {
    if (args.command === "help") {
      printHelp()
      return
    }
    if (args.command === "generate") return await runGenerate(args)
    if (args.command === "inspect") return await runInspect(args)
  } catch (err) {
    console.error(err instanceof Error ? err.message : err)
    process.exit(1)
  }
}

void main()
