import fs from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"
import Handlebars from "handlebars"
import {
  compile as compileJsonSchema,
  type Options as Json2TsOptions,
} from "json-schema-to-typescript"
import {
  fetchUpstreamTools,
  type FetchToolsOptions,
  type UpstreamToolDescriptor,
} from "./fetch-tools.js"

export interface CodegenConfig {
  /** The proxy name this upstream is federated under (tool name prefix). */
  proxyName: string
  upstreamUrl: string
  auth?: FetchToolsOptions["auth"]
  /** Output directory (relative paths resolve against process.cwd()). */
  out: string
  /**
   * Optional per-tool type overrides. Keys are full tool names
   * (`<proxy>_<tool>`), values are literal TypeScript type expressions
   * that replace the codegen output for that tool.
   *
   * Useful when the upstream omits `outputSchema` — generated output type
   * defaults to `unknown`, an override lets you paste a hand-written
   * result shape without editing the generated file.
   */
  overrides?: Record<string, { input?: string; output?: string }>
}

export interface CodegenResult {
  toolsFile: string
  hooksFile: string
  tools: UpstreamToolDescriptor[]
}

/**
 * Fetches `tools/list` from the upstream MCP, runs `json-schema-to-typescript`
 * on each tool's input/output schemas, and renders the two generated files
 * from the shipped Handlebars templates.
 *
 * Called by the CLI (`mcp-tool-codegen generate`) but exposed programmatically
 * so consumers can wire it into custom build pipelines or tests.
 */
export async function generateTools(config: CodegenConfig): Promise<CodegenResult> {
  const tools = await fetchUpstreamTools({
    upstreamUrl: config.upstreamUrl,
    auth: config.auth,
  })

  const proxyPascal = toPascalCase(config.proxyName)
  const toolMapName = `${proxyPascal}ToolMap`
  const toolNameTypeName = `${proxyPascal}ToolName`
  const callToolTypeName = `${proxyPascal}CallTool`

  const view = {
    proxyName: config.proxyName,
    upstreamUrl: config.upstreamUrl,
    toolMapName,
    toolNameTypeName,
    callToolTypeName,
    tools: await Promise.all(tools.map((tool) => renderTool(tool, config, proxyPascal))),
  }

  const [toolsTpl, hooksTpl] = await Promise.all([
    loadTemplate("tools.ts.hbs"),
    loadTemplate("hooks.tsx.hbs"),
  ])

  return {
    toolsFile: toolsTpl(view),
    hooksFile: hooksTpl(view),
    tools,
  }
}

async function renderTool(
  tool: UpstreamToolDescriptor,
  config: CodegenConfig,
  proxyPascal: string,
): Promise<Record<string, unknown>> {
  const toolPascal = toPascalCase(tool.name)
  const inputTypeName = `${proxyPascal}${toolPascal}Input`
  const outputTypeName = `${proxyPascal}${toolPascal}Output`
  const fullName = `${config.proxyName}_${tool.name}`
  const override = config.overrides?.[fullName]

  const inputTypeBody = override?.input
    ? undefined
    : await schemaToType(tool.inputSchema, inputTypeName)
  const outputTypeBody = override?.output
    ? undefined
    : tool.outputSchema
      ? await schemaToType(tool.outputSchema, outputTypeName)
      : undefined

  const inputTypeRef = override?.input ?? (inputTypeBody ? inputTypeName : "unknown")
  const outputTypeRef = override?.output ?? (outputTypeBody ? outputTypeName : "unknown")

  return {
    name: tool.name,
    fullName,
    quotedFullName: JSON.stringify(fullName),
    hookName: `use${proxyPascal}${toolPascal}`,
    inputTypeBody,
    outputTypeBody,
    inputTypeRef,
    outputTypeRef,
    queryKey: JSON.stringify([config.proxyName, tool.name]),
  }
}

const json2tsOptions: Partial<Json2TsOptions> = {
  bannerComment: "",
  additionalProperties: false,
  style: { singleQuote: false, semi: false },
  unreachableDefinitions: false,
}

async function schemaToType(schema: Record<string, unknown>, name: string): Promise<string> {
  const result = await compileJsonSchema(
    // json-schema-to-typescript treats the top-level title as the type name.
    { title: name, ...schema } as Parameters<typeof compileJsonSchema>[0],
    name,
    json2tsOptions,
  )
  return result.trim()
}

function toPascalCase(input: string): string {
  return input
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("")
}

let templateDir: string | undefined
async function loadTemplate(name: string): Promise<HandlebarsTemplateDelegate> {
  if (!templateDir) {
    const here = path.dirname(fileURLToPath(import.meta.url))
    // dist/codegen.js → ../templates
    templateDir = path.resolve(here, "..", "templates")
  }
  const src = await fs.readFile(path.join(templateDir, name), "utf-8")
  return Handlebars.compile(src, { noEscape: true })
}

/** Resolve an output path against cwd, creating the directory if needed. */
export async function writeCodegenOutput(
  config: CodegenConfig,
  result: CodegenResult,
): Promise<void> {
  const outDir = path.resolve(process.cwd(), config.out)
  await fs.mkdir(outDir, { recursive: true })
  await Promise.all([
    fs.writeFile(path.join(outDir, "tools.ts"), result.toolsFile),
    fs.writeFile(path.join(outDir, "hooks.tsx"), result.hooksFile),
  ])
}
