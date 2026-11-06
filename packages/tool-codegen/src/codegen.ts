import fs from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"
import Handlebars from "handlebars"
import { validateConfig, type CodegenConfig } from "./config.js"
import { argsAreOptional, declareType, OBJECT_MEMBERS, type Declaration } from "./declarations.js"
import { fetchTools, type ToolDescriptor } from "./fetch-tools.js"
import { camelCase, jsString, NameRegistry, pascalCase, propertyKey } from "./identifiers.js"
import {
  arrowProperty,
  assignment,
  breakAfterOperator,
  call,
  functionSignature,
  namedImport,
  printDoc,
  typeArguments,
} from "./layout.js"
import { docComment, sourceOf } from "./safe-text.js"
import { sanitizeSchema, type JsonObject } from "./sanitize-schema.js"
import { normalizeRefs } from "./schema-refs.js"

export interface CodegenResult {
  /** `tools.ts`: the types, the tool map and the typed client factory; imports only the core package. */
  toolsFile: string
  /** `hooks.tsx`, rendered only with `react: true`; imports only the React package and `./tools.js`. */
  hooksFile?: string
  /** The tools as the server listed them, sorted by name. */
  tools: ToolDescriptor[]
}

const CORE_PACKAGE = "@miragon/mcp-toolkit-tool-codegen-core"
const REACT_PACKAGE = "@miragon/mcp-toolkit-tool-codegen-react"

/**
 * Fetches the server's tools/list and renders the generated files (nothing is
 * written; see `writeCodegenOutput`). The CLI's `generate`, as a function.
 */
export async function generateTools(config: CodegenConfig): Promise<CodegenResult> {
  const valid = validateConfig(config)
  const tools = await fetchTools({ url: valid.url, auth: valid.auth, headers: valid.headers })
  return renderCodegen(tools, valid)
}

/**
 * Renders the generated files from a tool list: the network-free half of
 * `generateTools`. Sorted by tool name, so the output is byte-identical for
 * every order of the same tools/list.
 *
 * Every tool field is untrusted: identifiers are built only from the
 * [A-Za-z0-9] runs of a tool name, names appear elsewhere only as string
 * literals, schemas are sanitised and their `$ref`s normalised before
 * json-schema-to-typescript sees them, and two tools that would declare the
 * same identifier fail the generation.
 */
export async function renderCodegen(
  tools: readonly ToolDescriptor[],
  config: CodegenConfig,
): Promise<CodegenResult> {
  const valid = validateConfig(config)
  const sorted = checkedToolList(tools, valid)
  const names = clientNames(valid.name)
  const rendered = await Promise.all(sorted.map((tool) => renderTool(tool, valid, names)))
  claimToolsFileNames(rendered, names, valid.name)
  const source = sourceOf(valid.url)
  const templates = await loadTemplates()
  const toolsFile = templates.tools(toolsView(rendered, names, source))
  if (valid.react !== true) return { toolsFile, tools: sorted }
  const hooksFile = templates.hooks(hooksView(rendered, names, source, valid.name))
  return { toolsFile, hooksFile, tools: sorted }
}

// ── Tools ───────────────────────────────────────────────────────────────────

interface ClientNames {
  readonly prefix: string
  readonly toolMap: string
  readonly toolName: string
  readonly callTool: string
  readonly createClient: string
  readonly client: string
  /** The React query-key helper of hooks.tsx. */
  readonly queryKey: string
  /** The React query-key namespace, as a string literal. */
  readonly namespace: string
}

function clientNames(name: string): ClientNames {
  const prefix = pascalCase(name)
  return {
    prefix,
    toolMap: `${prefix}ToolMap`,
    toolName: `${prefix}ToolName`,
    callTool: `${prefix}CallTool`,
    createClient: `create${prefix}Client`,
    client: `${prefix}Client`,
    queryKey: `${prefix.charAt(0).toLowerCase()}${prefix.slice(1)}QueryKey`,
    namespace: jsString(name),
  }
}

interface RenderedTool {
  readonly tool: ToolDescriptor
  /** The tool name as a string literal. */
  readonly literal: string
  readonly pascal: string
  /** The client method. */
  readonly camel: string
  readonly inputType: string
  readonly outputType: string
  readonly argsOptional: boolean
  readonly hook: "query" | "mutation"
  readonly declarations: readonly Declaration[]
}

function checkedToolList(
  tools: readonly ToolDescriptor[],
  config: CodegenConfig,
): ToolDescriptor[] {
  const seen = new Set<string>()
  for (const tool of tools) {
    if (typeof tool.name !== "string") throw new Error("the server lists a tool without a name")
    if (seen.has(tool.name))
      throw new Error(`the server lists the tool ${jsString(tool.name)} twice`)
    seen.add(tool.name)
  }
  const unknown = Object.keys(config.overrides ?? {}).filter((name) => !seen.has(name))
  if (unknown.length > 0) {
    throw new Error(
      `"overrides" names tools the server does not list: ${unknown.map(jsString).join(", ")}`,
    )
  }
  // Code-unit order, not localeCompare: the output must not depend on the
  // machine's locale. Names are unique by now, so no two compare equal.
  return [...tools].sort((a, b) => (a.name < b.name ? -1 : 1))
}

/** A tool's schema as json-schema-to-typescript may see it: sanitised, with normalised `$ref`s. */
function prepareSchema(schema: unknown): JsonObject {
  return normalizeRefs(sanitizeSchema(schema))
}

async function renderTool(
  tool: ToolDescriptor,
  config: CodegenConfig,
  names: ClientNames,
): Promise<RenderedTool> {
  const override = config.overrides?.[tool.name]
  const source = override?.identifier ?? tool.name
  const pascal = pascalCase(source)
  if (pascal === "") {
    throw new Error(
      `cannot generate code for the tool ${jsString(tool.name)}: its name has no ASCII letter or digit to build an identifier from. Rename it on the server, or give it one with overrides.<tool>.identifier.`,
    )
  }
  const inputType = `${names.prefix}${pascal}Input`
  const outputType = `${names.prefix}${pascal}Output`
  const input = prepareSchema(tool.inputSchema)
  const output = tool.outputSchema === undefined ? undefined : prepareSchema(tool.outputSchema)
  const declarations = await Promise.all([
    declareType(tool, "input", inputType, override?.input, input),
    declareType(tool, "output", outputType, override?.output, output),
  ])
  // MCP's readOnlyHint defaults to false; a query hook re-runs on every
  // refetch, so only a tool that declares itself read-only gets one.
  const readOnly = tool.annotations?.readOnlyHint === true
  return {
    tool,
    literal: jsString(tool.name),
    pascal,
    camel: camelCase(source),
    inputType,
    outputType,
    argsOptional: override?.input === undefined && argsAreOptional(input),
    hook: override?.hook ?? (readOnly ? "query" : "mutation"),
    declarations,
  }
}

const CORE_VALUE_IMPORTS = ["createTypedCallTool"]
const CORE_TYPE_IMPORTS = ["ToolCallOptions", "ToolCaller", "TypedCallTool"]
/**
 * Members JavaScript looks up on any object: as a client method, `then` makes
 * the client a thenable that `await` calls, `toJSON`, `toString` and friends
 * run on serialisation and string conversion, and the rest shadow what code
 * calls on objects.
 */
const OBJECT_MEMBER_NAMES = ["then", ...OBJECT_MEMBERS, "toJSON"]

function claimToolsFileNames(
  rendered: readonly RenderedTool[],
  names: ClientNames,
  configName: string,
): void {
  const file = new NameRegistry("tools.ts")
  for (const name of [...CORE_VALUE_IMPORTS, ...CORE_TYPE_IMPORTS]) {
    file.claim(name, `the import ${name}`, false)
  }
  const fixed = [names.toolMap, names.toolName, names.callTool, names.createClient, names.client]
  for (const name of fixed) file.claim(name, `the config name ${jsString(configName)}`, false)
  const client = new NameRegistry("the client of tools.ts")
  client.claim("call", "the client's own call", false)
  for (const name of OBJECT_MEMBER_NAMES) {
    client.claim(name, `JavaScript's object member ${name}`, false)
  }
  for (const { tool, camel, declarations } of rendered) {
    const owner = `the tool ${jsString(tool.name)}`
    for (const name of declarations.flatMap((declaration) => declaration.names)) {
      file.claim(name, owner, true)
    }
    client.claim(camel, owner, true)
  }
}

function toolsView(rendered: readonly RenderedTool[], names: ClientNames, source: string) {
  const typeImports = rendered.length > 0 ? CORE_TYPE_IMPORTS : CORE_TYPE_IMPORTS.slice(1)
  const specifiers = [...CORE_VALUE_IMPORTS, ...typeImports.map((name) => `type ${name}`)]
  return {
    source,
    coreImport: printDoc(namedImport(specifiers, CORE_PACKAGE)),
    declarations: rendered.flatMap((tool) => tool.declarations.map(({ code }) => code)),
    names,
    tools: rendered.map((tool) => ({
      key: propertyKey(tool.tool.name),
      inputType: tool.inputType,
      outputType: tool.outputType,
    })),
    toolNameAlias: printDoc(assignment(`export type ${names.toolName}`, `keyof ${names.toolMap}`)),
    callToolAlias: printDoc(
      assignment(`export type ${names.callTool}`, [
        "TypedCallTool",
        typeArguments([names.toolMap]),
      ]),
    ),
    clientSignature: printDoc(
      functionSignature(`export function ${names.createClient}`, [], ["callTool: ToolCaller"]),
    ),
    callBinding: printDoc(
      breakAfterOperator(
        "const call",
        call("createTypedCallTool", typeArguments([names.toolMap]), ["callTool"]),
      ),
      1,
    ),
    clientMethods: rendered.map(
      (tool) =>
        docComment(tool.tool.description, "    ") +
        printDoc(
          arrowProperty(
            tool.camel,
            [argsParameter(tool), "options?: ToolCallOptions"],
            call("call", "", [tool.literal, "args", "options"]),
          ),
          2,
        ),
    ),
    clientAlias: printDoc(
      assignment(`export type ${names.client}`, [
        "ReturnType",
        typeArguments([`typeof ${names.createClient}`]),
      ]),
    ),
  }
}

function argsParameter(tool: RenderedTool): string {
  return `args: ${tool.inputType}${tool.argsOptional ? " = {}" : ""}`
}

// ── Hooks ───────────────────────────────────────────────────────────────────

function hookName(tool: RenderedTool, names: ClientNames): string {
  return `use${names.prefix}${tool.pascal}${tool.hook === "query" ? "Query" : "Mutation"}`
}

function hooksView(
  rendered: readonly RenderedTool[],
  names: ClientNames,
  source: string,
  configName: string,
) {
  const queries = rendered.filter((tool) => tool.hook === "query")
  const mutations = rendered.filter((tool) => tool.hook === "mutation")
  const values = [
    ...(queries.length > 0 ? ["toolQueryKey"] : []),
    ...(mutations.length > 0 ? ["useToolMutation"] : []),
    ...(queries.length > 0 ? ["useToolQuery"] : []),
  ]
  const types = [
    ...(queries.length > 0 ? ["ToolCallQueryKey"] : []),
    ...(mutations.length > 0 ? ["UseToolMutationOptions"] : []),
    ...(queries.length > 0 ? ["UseToolQueryOptions"] : []),
  ]
  // Hook names need no claim: use<Prefix><Pascal>Query|Mutation collide only when two tools'
  // Pascal names do, which tools.ts rejects, and never spell an import (both parts start with a
  // capital). The query-key helper is claimed whether or not it is written; unwritten, nothing
  // it could collide with is imported.
  const file = new NameRegistry("hooks.tsx")
  for (const name of [...values, ...types]) file.claim(name, `the import ${name}`, false)
  file.claim(names.queryKey, `the config name ${jsString(configName)}`, false)
  const toolTypes = [
    ...(queries.length > 0 ? [names.toolName] : []),
    ...queries.flatMap((tool) => [tool.inputType, tool.outputType]),
  ]
  return {
    source,
    reactImport: printDoc(
      namedImport([...values, ...types.map((name) => `type ${name}`)], REACT_PACKAGE),
    ),
    toolsImport: printDoc(namedImport([names.toolMap, ...toolTypes].sort(), "./tools.js", true)),
    queryKey: queries.length > 0 ? queryKeyHelper(names) : undefined,
    hooks: rendered.map((tool) => ({
      doc: docComment(tool.tool.description),
      ...(tool.hook === "query" ? queryHook(tool, names) : mutationHook(tool, names)),
    })),
  }
}

/**
 * `<name>QueryKey(tool, args)`: the typed `toolQueryKey` of this server's
 * namespace. Its return type is spelled out: the key's output tag is a symbol
 * of TanStack's that a declaration file cannot name.
 */
function queryKeyHelper(names: ClientNames) {
  const signature = functionSignature(
    `export function ${names.queryKey}`,
    [`TName extends ${names.toolName}`],
    ["name: TName", `args: ${names.toolMap}[TName]["input"]`],
    ["ToolCallQueryKey", typeArguments([names.toolMap, "TName"])],
  )
  const body = call("toolQueryKey", typeArguments([names.toolMap, "TName"]), [
    names.namespace,
    "name",
    "args",
  ])
  return { signature: printDoc(signature), body: printDoc(["return ", body], 1) }
}

function queryHook(tool: RenderedTool, names: ClientNames) {
  const signature = functionSignature(
    `export function ${hookName(tool, names)}`,
    [assignment("TSelected", tool.outputType)],
    [
      argsParameter(tool),
      ["options?: UseToolQueryOptions", typeArguments([tool.outputType, "TSelected"])],
    ],
  )
  const body = call("useToolQuery", typeArguments([names.toolMap, tool.literal, "TSelected"]), [
    names.namespace,
    tool.literal,
    "args",
    "options",
  ])
  return { signature: printDoc(signature), body: printDoc(["return ", body], 1) }
}

function mutationHook(tool: RenderedTool, names: ClientNames) {
  const mutationTypes = typeArguments([names.toolMap, tool.literal, "TOnMutateResult"])
  const signature = functionSignature(
    `export function ${hookName(tool, names)}`,
    [assignment("TOnMutateResult", "unknown")],
    [["options?: UseToolMutationOptions", mutationTypes]],
  )
  const body = call("useToolMutation", mutationTypes, [names.namespace, tool.literal, "options"])
  return { signature: printDoc(signature), body: printDoc(["return ", body], 1) }
}

// ── Templates ───────────────────────────────────────────────────────────────

interface Templates {
  readonly tools: HandlebarsTemplateDelegate
  readonly hooks: HandlebarsTemplateDelegate
}

let templates: Promise<Templates> | undefined

/** The shipped templates (`templates/` next to `src/` and `dist/`), compiled once per process. */
function loadTemplates(): Promise<Templates> {
  templates ??= (async () => {
    const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "templates")
    // The templates insert every value with {{{ }}}: code, never HTML-escaped.
    const load = async (file: string) =>
      Handlebars.compile(await fs.readFile(path.join(dir, file), "utf-8"))
    const [tools, hooks] = await Promise.all([load("tools.ts.hbs"), load("hooks.tsx.hbs")])
    return { tools, hooks }
  })()
  return templates
}
