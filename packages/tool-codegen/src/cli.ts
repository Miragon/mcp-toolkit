#!/usr/bin/env node
import { realpathSync } from "node:fs"
import fs from "node:fs/promises"
import path from "node:path"
import { pathToFileURL } from "node:url"
import { generateTools } from "./codegen.js"
import {
  hasCredentials,
  isHeaderName,
  isHeaderValue,
  isHttpUrl,
  validateConfig,
  type CodegenConfig,
} from "./config.js"
import { fetchTools, type CodegenAuth } from "./fetch-tools.js"
import { checkCodegenOutput, writeCodegenOutput, type CodegenDrift } from "./output.js"
import { logText, terminalText } from "./safe-text.js"

export type CliCommand =
  | { command: "help" }
  | { command: "generate"; config: string; check: boolean }
  | { command: "inspect"; url: string; auth: CodegenAuth }

/** A command line the CLI does not accept (exit code 2). */
export class UsageError extends Error {}

export interface CliIo {
  out(text: string): void
  err(text: string): void
  cwd(): string
}

const USAGE = `Usage:
  mcp-tool-codegen generate [--config <path>] [--check]
  mcp-tool-codegen inspect --url <url> [--token <token> | --header <name> --header-value <value>]
  mcp-tool-codegen help`

const HELP = `mcp-tool-codegen: typed TypeScript clients from an MCP server's tools/list.

${USAGE}

generate   Fetch tools/list and write tools.ts (and hooks.tsx with react: true)
           into the config's out directory.
  --config <path>   Config module whose default export is a CodegenConfig
                    (default: ./codegen.config.ts). out resolves against its directory.
  --check           Write nothing; exit 1 when a generated file is missing, differs
                    from a fresh generation, or is a stale hooks.tsx (CI drift gate).

inspect    Print the server's tools as a Markdown table.
  --url <url>                              Streamable HTTP endpoint of the MCP server.
  --token <token>                          Send "Authorization: Bearer <token>".
  --header <name> --header-value <value>   Send a custom auth header instead.

help       Show this message.`

const DEFAULT_CONFIG = "codegen.config.ts"

const COMMAND_FLAGS = {
  generate: { "--config": "value", "--check": "switch" },
  inspect: { "--url": "value", "--token": "value", "--header": "value", "--header-value": "value" },
} as const

/** The 2.x flags 3.0 renamed or dropped, with what replaces them. */
const FLAGS_2X: Record<string, string> = {
  "-c": "3.0 renamed it to --config",
  "-u": "3.0 renamed it to --url",
  "--upstream": "3.0 renamed it to --url",
  "-o": "3.0 dropped it: out is set in the config",
  "--out": "3.0 dropped it: out is set in the config",
  "-p": "3.0 dropped it: name is set in the config",
  "--proxy": "3.0 dropped it: name is set in the config",
}

type FlagValues = Map<string, string | true>

/** Parses the arguments after the binary name; throws `UsageError` for anything it does not know. */
export function parseArgs(argv: readonly string[]): CliCommand {
  const [command, ...rest] = argv
  if (command === undefined) throw new UsageError("missing command")
  if (command === "help" || command === "--help" || command === "-h") {
    if (rest.length > 0) throw new UsageError(`unexpected argument ${JSON.stringify(rest[0])}`)
    return { command: "help" }
  }
  if (command !== "generate" && command !== "inspect") {
    throw new UsageError(`unknown command ${JSON.stringify(command)}`)
  }
  const flags = readFlags(command, rest)
  if (flags.has("--help")) return { command: "help" }
  return command === "generate" ? generateCommand(flags) : inspectCommand(flags)
}

function readFlags(command: keyof typeof COMMAND_FLAGS, args: readonly string[]): FlagValues {
  const known: Record<string, "value" | "switch"> = COMMAND_FLAGS[command]
  const flags: FlagValues = new Map()
  for (let i = 0; i < args.length; i++) {
    const arg = args[i] ?? ""
    if (arg === "--help" || arg === "-h") {
      flags.set("--help", true)
      continue
    }
    const kind = Object.hasOwn(known, arg) ? known[arg] : undefined
    if (kind === undefined) {
      if (!arg.startsWith("-")) throw new UsageError(`unexpected argument ${JSON.stringify(arg)}`)
      const renamed = Object.hasOwn(FLAGS_2X, arg) ? ` (${FLAGS_2X[arg]})` : ""
      throw new UsageError(`unknown flag ${JSON.stringify(arg)} for ${command}${renamed}`)
    }
    if (flags.has(arg)) throw new UsageError(`${arg} is given twice`)
    if (kind === "switch") {
      flags.set(arg, true)
      continue
    }
    const value = args[++i]
    if (value === undefined || value.startsWith("--")) throw new UsageError(`${arg} needs a value`)
    flags.set(arg, value)
  }
  return flags
}

function generateCommand(flags: FlagValues): CliCommand {
  const config = flags.get("--config")
  return {
    command: "generate",
    config: typeof config === "string" ? config : DEFAULT_CONFIG,
    check: flags.has("--check"),
  }
}

function inspectCommand(flags: FlagValues): CliCommand {
  const value = (flag: string) => {
    const found = flags.get(flag)
    return typeof found === "string" ? found : undefined
  }
  const url = value("--url")
  if (url === undefined) throw new UsageError("inspect needs --url <url>")
  checkInspectUrl(url)
  return {
    command: "inspect",
    url,
    auth: inspectAuth(value("--token"), value("--header"), value("--header-value")),
  }
}

// The checks below never echo a value: the URL or a header may carry a secret.

function checkInspectUrl(url: string): void {
  if (!isHttpUrl(url)) throw new UsageError("--url must be an http(s) URL")
  if (hasCredentials(url)) {
    throw new UsageError("--url must not carry credentials: pass them with --token or --header")
  }
}

function inspectAuth(
  token: string | undefined,
  headerName: string | undefined,
  headerValue: string | undefined,
): CodegenAuth {
  if (token !== undefined && (headerName !== undefined || headerValue !== undefined)) {
    throw new UsageError("use either --token or --header with --header-value, not both")
  }
  if (token !== undefined) return { mode: "bearer", token: checkedSecret("--token", token) }
  if (headerName === undefined && headerValue === undefined) return { mode: "none" }
  if (headerName === undefined || headerValue === undefined) {
    throw new UsageError("--header and --header-value go together")
  }
  if (!isHeaderName(headerName)) throw new UsageError("--header must be a valid header name")
  return { mode: "header", headerName, value: checkedSecret("--header-value", headerValue) }
}

function checkedSecret(flag: string, secret: string): string {
  if (isHeaderValue(secret)) return secret
  throw new UsageError(
    `${flag} must not contain line breaks, control characters or characters beyond Latin-1`,
  )
}

const processIo: CliIo = {
  out: (text) => process.stdout.write(`${text}\n`),
  err: (text) => process.stderr.write(`${text}\n`),
  cwd: () => process.cwd(),
}

/** Runs the CLI and returns its exit code: 0 ok, 1 failed or drifted, 2 usage error. */
export async function runCli(argv: readonly string[], io: CliIo = processIo): Promise<number> {
  let command: CliCommand
  try {
    command = parseArgs(argv)
  } catch (error) {
    if (!(error instanceof UsageError)) throw error
    io.err(`mcp-tool-codegen: ${error.message}\n\n${USAGE}`)
    return 2
  }
  try {
    if (command.command === "help") {
      io.out(HELP)
      return 0
    }
    if (command.command === "generate") return await runGenerate(command, io)
    return await runInspect(command, io)
  } catch (error) {
    io.err(logText(error instanceof Error ? error.message : String(error)))
    return 1
  }
}

async function loadConfig(file: string): Promise<CodegenConfig> {
  await fs.access(file).catch((error: unknown) => {
    throw new Error(`config file not found: ${file}`, { cause: error })
  })
  let module: { default?: unknown }
  try {
    module = (await import(pathToFileURL(file).href)) as { default?: unknown }
  } catch (error) {
    throw new Error(`cannot load ${file}${loadHint(file, error)}: ${(error as Error).message}`, {
      cause: error,
    })
  }
  if (module.default === undefined) throw new Error(`${file} has no default export`)
  return validateConfig(module.default)
}

/** Why a config may fail to load, when the error says so. Exported for tests. */
export function loadHint(file: string, error: unknown): string {
  if ((error as NodeJS.ErrnoException).code === "ERR_UNKNOWN_FILE_EXTENSION") {
    return ' (Node.js loads a .ts config from version 22.18 on; use a .mjs config, or run the CLI with NODE_OPTIONS="--import tsx")'
  }
  // An ES module config read as CommonJS: `export` is a syntax error there.
  if (error instanceof SyntaxError && /\.[jt]s$/.test(file)) {
    const name = path.basename(file).replace(/\.([jt])s$/, ".m$1s")
    return ` (in a CommonJS package, name the config ${name} and pass it with --config)`
  }
  return ""
}

async function runGenerate(
  command: Extract<CliCommand, { command: "generate" }>,
  io: CliIo,
): Promise<number> {
  const configFile = path.resolve(io.cwd(), command.config)
  const config = await loadConfig(configFile)
  const outDir = path.resolve(path.dirname(configFile), config.out)
  const result = await generateTools(config)
  const count = `${result.tools.length} tool${result.tools.length === 1 ? "" : "s"}`

  if (!command.check) {
    const { written, removed } = await writeCodegenOutput(result, outDir)
    io.out(`generated ${count}: ${written.join(", ")} in ${outDir}`)
    for (const file of removed) io.out(`removed the stale ${file} (react is off)`)
    return 0
  }

  const drift = await checkCodegenOutput(result, outDir)
  if (drift.length === 0) {
    io.out(`up to date: ${count} in ${outDir}`)
    return 0
  }
  for (const entry of drift) io.err(describeDrift(entry, outDir))
  io.err(`run "mcp-tool-codegen generate" to update ${outDir}`)
  return 1
}

function describeDrift(drift: CodegenDrift, outDir: string): string {
  if (drift.kind === "missing") return `drift: ${drift.file} is missing in ${outDir}`
  if (drift.kind === "stale") {
    return `drift: ${drift.file} is stale: react is off, so generate would remove it`
  }
  return [
    `drift: ${drift.file} differs from a fresh generation`,
    ...lineDiff(drift.actual ?? "", drift.expected ?? ""),
  ].join("\n")
}

/**
 * The first differing lines, by position (no LCS): enough to show where a
 * regeneration changes the file. Generated text passes `terminalText`, since
 * it carries the server's descriptions.
 */
function lineDiff(committed: string, generated: string, maxLines = 20): string[] {
  const before = committed.split("\n")
  const after = generated.split("\n")
  const lines: string[] = []
  let shown = 0
  for (let i = 0; i < Math.max(before.length, after.length) && shown < maxLines; i++) {
    if (before[i] === after[i]) continue
    if (before[i] !== undefined) lines.push(`  - ${i + 1}: ${terminalText(before[i] ?? "")}`)
    if (after[i] !== undefined) lines.push(`  + ${i + 1}: ${terminalText(after[i] ?? "")}`)
    shown++
  }
  if (shown === maxLines) lines.push("  ... (more differences not shown)")
  return lines
}

async function runInspect(
  command: Extract<CliCommand, { command: "inspect" }>,
  io: CliIo,
): Promise<number> {
  const tools = await fetchTools({ url: command.url, auth: command.auth })
  const cell = (text: string) => terminalText(text).replaceAll("\n", " ").replaceAll("|", "\\|")
  io.out("| name | hook | description | input |")
  io.out("| --- | --- | --- | --- |")
  for (const tool of tools) {
    const hook = tool.annotations?.readOnlyHint === true ? "query" : "mutation"
    const properties = tool.inputSchema.properties
    const input =
      typeof properties === "object" && properties !== null ? Object.keys(properties) : []
    io.out(
      `| ${cell(tool.name)} | ${hook} | ${cell(tool.description ?? "")} | ${cell(input.join(", "))} |`,
    )
  }
  return 0
}

/**
 * True when this module is the process entry point, the guard that keeps
 * importing cli.ts side-effect free. argv[1] is the path as invoked, a
 * symlink for every installed bin (npm and pnpm link node_modules/.bin), while
 * import.meta.url is always the real path, so compare resolved paths.
 */
export function isEntryPoint(argv1: string | undefined, moduleUrl: string): boolean {
  if (!argv1) return false
  try {
    return moduleUrl === pathToFileURL(realpathSync(argv1)).href
  } catch {
    return moduleUrl === pathToFileURL(argv1).href
  }
}

if (isEntryPoint(process.argv[1], import.meta.url)) {
  process.exitCode = await runCli(process.argv.slice(2))
}
