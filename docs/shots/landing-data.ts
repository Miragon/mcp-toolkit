/**
 * The stage of the docs' landing page and the numbers under it, from a real run: what the example
 * server lists (tools/list) and what the generator wrote for it (the committed
 * examples/tasks/src/generated/tools.ts, which examples/tasks/test/codegen.test.ts holds equal to a
 * fresh `mcp-tool-codegen generate`). Writes docs/.vitepress/theme/landing-data.json, which
 * HomeLanding.vue and LandingStage.vue import; nothing on the stage is typed by hand.
 * examples/tasks/test/docs-landing.test.ts fails when the file drifts from the server or from
 * tools.ts.
 *
 * Rerun from the repository root after `pnpm install` (no build needed):
 *
 *   node docs/shots/landing-data.ts
 *
 * It starts examples/tasks (src/server.ts) on a free port with telemetry off, lists its tools over
 * streamable HTTP and stops it again.
 *
 * Changes to real output, and only these two:
 *   1. Pretty-printing. The server sends tools/list as compact JSON; the add-task entry is printed
 *      with two-space indentation, keys in the server's order, and an object or array of plain
 *      values stays on one line when that line fits in 72 characters.
 *   2. Cuts, each one marked. The entry's output schema shows only its property names between
 *      "…" (the card's head counts the whole list), and tools.ts shows three excerpts under the
 *      file's own line numbers; the page draws a "⋮" for each cut.
 *
 * The byte count is the answer's tools array, byte for byte as the server sends it, without the
 * JSON-RPC envelope.
 *
 * The number for "Why" counts what typing these tools by hand means: every tool name and every
 * property of every input and output schema, nested ones included (array items, nested objects),
 * each a string and a type a hand-written type must spell as the server does, after every server
 * change too; against what generating them takes: the example's config (its code lines, without
 * blank lines and comments), written once, and the one command that reads it (the example's
 * `generate` script).
 */
import { spawn } from "node:child_process"
import { readFileSync, writeFileSync } from "node:fs"
import path from "node:path"
import { githubSlug } from "../.vitepress/miragon/slug.mjs"

const REPO = path.resolve(import.meta.dirname, "../..")
const EXAMPLE = path.join(REPO, "examples/tasks")
/** The example's config, which `mcp-tool-codegen generate` reads by default. */
const CONFIG = "codegen.config.ts"
/** Where the generator writes in the example (its codegen.config.ts: out). */
const GENERATED = "src/generated"
export const LANDING_DATA = path.join(REPO, "docs/.vitepress/theme/landing-data.json")

/** The tool the stage follows from the server's list into the generated code. */
const TOOL = "add-task"
/** Lines of the pretty-printed entry stay within this width, so the card needs no scrollbar. */
const WIDTH = 72

/** One entry of tools/list as the server sends it. */
export interface Tool {
  name: string
  description?: string
  inputSchema: Schema
  outputSchema?: Schema
  annotations?: Record<string, unknown>
  [key: string]: unknown
}

interface Schema {
  type?: string
  properties?: Record<string, Schema>
  items?: Schema
  required?: string[]
  [key: string]: unknown
}

/** The example's files the stage reads, besides the server's answer. */
export interface ExampleFiles {
  config: string
  toolsTs: string
  hooksTsx: string
  scripts: Record<string, string>
}

export interface LandingData {
  $comment: string
  toolsList: { tools: number; bytes: number; tool: string; entry: string[] }
  toolsTs: { file: string; lines: number; excerpts: { from: number; lines: string[] }[] }
  why: {
    names: number
    fields: number
    places: number
    configLines: number
    command: string
    commandChars: number
  }
  steps: { generate: string; call: string; render: string; check: string }
}

export function readExample(): ExampleFiles {
  const read = (file: string) => readFileSync(path.join(EXAMPLE, file), "utf8")
  const { scripts } = JSON.parse(read("package.json")) as { scripts: Record<string, string> }
  return {
    config: read(CONFIG),
    toolsTs: read(`${GENERATED}/tools.ts`),
    hooksTsx: read(`${GENERATED}/hooks.tsx`),
    scripts,
  }
}

/** The lines of a text file, without the empty string after its final newline. */
export function linesOf(text: string): string[] {
  const lines = text.split("\n")
  return lines.at(-1) === "" ? lines.slice(0, -1) : lines
}

/** The lines of a TypeScript file that hold code: no blank lines, no comment lines. */
export function codeLinesOf(text: string): number {
  let comment = false
  return linesOf(text).filter((line) => {
    const trimmed = line.trim()
    if (comment) {
      comment = !trimmed.includes("*/")
      return false
    }
    if (trimmed.startsWith("/*")) {
      comment = !trimmed.includes("*/")
      return false
    }
    return trimmed !== "" && !trimmed.startsWith("//")
  }).length
}

function fail(message: string): never {
  throw new Error(`docs/shots/landing-data.ts: ${message}`)
}

/** Every property position of a schema, depth first, array items and nested objects included. */
function propertiesOf(schema: Schema | undefined): string[] {
  if (schema === undefined) return []
  const found = schema.items ? propertiesOf(schema.items) : []
  for (const [key, value] of Object.entries(schema.properties ?? {})) {
    found.push(key, ...propertiesOf(value))
  }
  return found
}

const isPlain = (value: unknown) => value === null || typeof value !== "object"

/** JSON with two-space indentation; `shorten` may print a member as one marked line instead. */
function printJson(
  value: unknown,
  shorten: (key: string, value: unknown) => string | undefined,
  indent = "",
  prefix = "",
  suffix = "",
): string[] {
  if (isPlain(value)) return [`${indent}${prefix}${JSON.stringify(value)}${suffix}`]
  const isArray = Array.isArray(value)
  const members: [string | undefined, unknown][] = isArray
    ? (value as unknown[]).map((item) => [undefined, item])
    : Object.entries(value as object)
  const [open, close] = isArray ? ["[", "]"] : ["{", "}"]
  const label = (key: string | undefined) => (key === undefined ? "" : `${JSON.stringify(key)}: `)
  if (members.every(([, member]) => isPlain(member))) {
    const inner = members.map(([key, member]) => label(key) + JSON.stringify(member)).join(", ")
    const line = `${indent}${prefix}${isArray ? `[${inner}]` : `{ ${inner} }`}${suffix}`
    if (line.length <= WIDTH) return [line]
  }
  const lines = [`${indent}${prefix}${open}`]
  members.forEach(([key, member], index) => {
    const comma = index < members.length - 1 ? "," : ""
    const short = key === undefined ? undefined : shorten(key, member)
    if (short !== undefined) lines.push(`${indent}  ${label(key)}${short}${comma}`)
    else lines.push(...printJson(member, shorten, `${indent}  `, label(key), comma))
  })
  lines.push(`${indent}${close}${suffix}`)
  return lines
}

/** The client method that calls a tool: the line before `call("<tool>", …)` in tools.ts. */
function methodOf(lines: string[], tool: string): { name: string; index: number } {
  const call = lines.findIndex((line) => line.includes(`call(${JSON.stringify(tool)},`))
  const name = /^ {4}(\w+): \(/.exec(lines[call - 1] ?? "")?.[1]
  if (call < 1 || name === undefined) fail(`tools.ts has no client method for ${tool}`)
  return { name, index: call - 1 }
}

/** A range of tools.ts from the line at `start` (0-based) through the next one matching `through`. */
function excerpt(lines: string[], start: number, through: RegExp) {
  const end = lines.findIndex((line, index) => index >= start && through.test(line))
  if (start < 0 || end < 0) fail(`tools.ts has no excerpt ending in ${String(through)}`)
  return { from: start + 1, lines: lines.slice(start, end + 1) }
}

/** Derives everything the landing page shows from the server's tools and the example's files. */
export function buildLandingData(tools: Tool[], example: ExampleFiles): LandingData {
  const tool = tools.find((candidate) => candidate.name === TOOL) ?? fail(`no tool ${TOOL}`)
  const lines = linesOf(example.toolsTs)
  const prefix = /^export function create(\w+)Client\(/m.exec(example.toolsTs)?.[1]
  if (prefix === undefined) fail("tools.ts declares no create<Name>Client")

  const added = methodOf(lines, TOOL)
  if (!/^ {4}\/\*\* .* \*\/$/.test(lines[added.index - 1] ?? "")) {
    fail(`tools.ts has no one-line description above ${added.name}`)
  }
  const typeLine = (name: string) =>
    lines.findIndex((line) => line === `export interface ${name} {`)
  const excerpts = [
    // The input type of the tool, with the description the server gave its field.
    excerpt(
      lines,
      typeLine(`${prefix}${added.name[0]?.toUpperCase()}${added.name.slice(1)}Input`),
      /^\}$/,
    ),
    // The tool map keyed by the server's own names, down to the tool's entry.
    excerpt(lines, typeLine(`${prefix}ToolMap`), /^ {2}\}$/),
    // The client's method for the tool, under the server's description.
    excerpt(lines, added.index - 1, /^ {6}call\(/),
  ]
  if (!excerpts[1]?.lines.includes(`  ${JSON.stringify(TOOL)}: {`)) {
    fail(`the tool map excerpt does not end on ${TOOL}`)
  }

  // The read-only tool without required input: what a component lists on mount.
  const listing = tools.find(
    (candidate) =>
      candidate.annotations?.readOnlyHint === true && !candidate.inputSchema.required?.length,
  )
  if (listing === undefined) fail("the server has no read-only tool without required input")
  const listed = methodOf(lines, listing.name).name
  const hook = `use${prefix}${listed[0]?.toUpperCase()}${listed.slice(1)}Query`
  if (!new RegExp(`^export function ${hook}[<(]`, "m").test(example.hooksTsx)) {
    fail(`hooks.tsx exports no ${hook}`)
  }

  const fields = tools.reduce(
    (sum, candidate) =>
      sum +
      propertiesOf(candidate.inputSchema).length +
      propertiesOf(candidate.outputSchema).length,
    0,
  )
  const command = example.scripts.generate ?? fail("examples/tasks has no generate script")
  const shortenOutput = (key: string, value: unknown) =>
    key === "outputSchema"
      ? `{ … ${Object.keys((value as Schema).properties ?? {})
          .map((name) => JSON.stringify(name))
          .join(", ")} … }`
      : undefined

  return {
    $comment: "Written by docs/shots/landing-data.ts from a real run. Do not edit by hand.",
    toolsList: {
      tools: tools.length,
      bytes: Buffer.byteLength(JSON.stringify(tools)),
      tool: TOOL,
      entry: printJson(tool, shortenOutput),
    },
    toolsTs: { file: `${GENERATED}/tools.ts`, lines: lines.length, excerpts },
    why: {
      names: tools.length,
      fields,
      places: tools.length + fields,
      configLines: codeLinesOf(example.config),
      command,
      commandChars: command.length,
    },
    steps: {
      generate: command,
      call: `${prefix.toLowerCase()}.${added.name}({ ${(tool.inputSchema.required ?? []).join(", ")} })`,
      render: `${hook}()`,
      check:
        example.scripts["generate:check"] ?? fail("examples/tasks has no generate:check script"),
    },
  }
}

/** One JSON-RPC request over streamable HTTP; the answer comes as JSON or as server-sent events. */
async function request(url: URL, session: { id: string | null }, message: object) {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      ...(session.id === null ? {} : { "mcp-session-id": session.id }),
    },
    body: JSON.stringify({ jsonrpc: "2.0", ...message }),
  })
  session.id ??= response.headers.get("mcp-session-id")
  const text = await response.text()
  if (!response.ok) fail(`${url.origin} answered ${response.status}: ${text}`)
  if (!("id" in message)) return undefined
  const bodies = response.headers.get("content-type")?.startsWith("text/event-stream")
    ? text.split(/\n\n/).map((event) =>
        event
          .split("\n")
          .filter((line) => line.startsWith("data:"))
          .map((line) => line.slice(5).trimStart())
          .join("\n"),
      )
    : [text]
  for (const body of bodies.filter(Boolean)) {
    const answer = JSON.parse(body) as { id?: unknown; result?: unknown; error?: unknown }
    if (answer.id !== message.id) continue
    if (answer.error !== undefined) fail(`${url.origin} failed: ${JSON.stringify(answer.error)}`)
    return answer.result
  }
  return fail(`${url.origin} sent no answer to request ${String(message.id)}`)
}

/** The complete tools/list of an MCP server, every page, as the server sends it. */
export async function listTools(url: URL): Promise<Tool[]> {
  const session = { id: null as string | null }
  await request(url, session, {
    id: 1,
    method: "initialize",
    params: {
      protocolVersion: "2025-06-18",
      capabilities: {},
      clientInfo: { name: "mcp-toolkit-docs", version: "0.0.0" },
    },
  })
  await request(url, session, { method: "notifications/initialized" })
  const tools: Tool[] = []
  let cursor: string | undefined
  let id = 2
  do {
    const page = (await request(url, session, {
      id: id++,
      method: "tools/list",
      params: cursor === undefined ? {} : { cursor },
    })) as { tools: Tool[]; nextCursor?: string }
    tools.push(...page.tools)
    cursor = page.nextCursor
  } while (cursor !== undefined)
  if (session.id !== null) {
    await fetch(url, { method: "DELETE", headers: { "mcp-session-id": session.id } }).catch(
      () => undefined,
    )
  }
  return tools
}

/** The anchors of a page's headings, as the docs kit writes them (GitHub's rule, duplicates -1, -2). */
export function headingAnchors(markdown: string): Set<string> {
  const anchors = new Set<string>()
  const seen = new Map<string, number>()
  let fence: string | undefined
  for (const line of markdown.split("\n")) {
    const marker = /^\s*(`{3,}|~{3,})/.exec(line)?.[1]
    if (marker !== undefined) {
      if (fence === undefined) fence = marker
      else if (marker.startsWith(fence)) fence = undefined
      continue
    }
    const heading = fence === undefined ? /^#{1,6}\s+(.+?)\s*#*\s*$/.exec(line)?.[1] : undefined
    if (heading === undefined) continue
    const custom = /\{#([^}]+)\}$/.exec(heading)?.[1]
    const text = heading
      .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
      .replace(/[`*_]/g, "")
      .trim()
    const base = custom ?? githubSlug(text)
    const count = seen.get(base) ?? 0
    seen.set(base, count + 1)
    anchors.add(count === 0 ? base : `${base}-${count}`)
  }
  return anchors
}

/** `node --import tsx src/server.ts` in the example on a free port, as its tests start it. */
async function startExampleServer(): Promise<{ url: URL; close(): Promise<void> }> {
  const child = spawn(process.execPath, ["--import", "tsx", "src/server.ts"], {
    cwd: EXAMPLE,
    env: { ...process.env, PORT: "0", MCP_USE_ANONYMIZED_TELEMETRY: "false" },
    stdio: ["ignore", "pipe", "pipe"],
  })
  const exited = new Promise<void>((resolve) => child.once("exit", () => resolve()))
  const close = async () => {
    if (child.exitCode === null && child.signalCode === null) child.kill()
    await exited
  }
  let output = ""
  try {
    const url = await new Promise<string>((resolve, reject) => {
      const collect = (chunk: Buffer) => {
        output += chunk.toString()
        const listening = /listening on (http:\/\/\S+)/.exec(output)?.[1]
        if (listening !== undefined) resolve(listening)
      }
      child.stdout.on("data", collect)
      child.stderr.on("data", collect)
      child.once("error", reject)
      child.once("exit", (code) => reject(new Error(`the server exited (${code}):\n${output}`)))
    })
    return { url: new URL(url), close }
  } catch (error) {
    await close()
    throw error
  }
}

if (import.meta.main) {
  const server = await startExampleServer()
  try {
    const data = buildLandingData(await listTools(server.url), readExample())
    const { format, resolveConfig } = await import("prettier")
    const options = { ...(await resolveConfig(LANDING_DATA)), filepath: LANDING_DATA }
    writeFileSync(LANDING_DATA, await format(JSON.stringify(data), options))
    console.log(
      `wrote ${path.relative(REPO, LANDING_DATA)}: ${data.toolsList.tools} tools, ` +
        `${data.toolsList.bytes} bytes, tools.ts ${data.toolsTs.lines} lines, ` +
        `${data.why.places} places against ${data.why.configLines} config lines and ` +
        `${data.why.commandChars} characters`,
    )
  } finally {
    await server.close()
  }
}
