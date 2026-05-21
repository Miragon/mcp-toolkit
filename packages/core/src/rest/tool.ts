import type { z } from "zod"

import type { ToolConfig } from "../tools/register-tool.js"
import type { HttpMethod, QueryValue, RestClient, RestRequestOptions } from "./types.js"

type ZodRawShape = Record<string, z.ZodTypeAny>

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- MCP SDK provides args as Record<string, any> after zod validation
type ToolArgs = Record<string, any>

/**
 * Subset of `RestRequestOptions` that a `buildRequest` callback may return.
 * `method` and `path` are fixed by the tool definition.
 */
export type RequestParts = Pick<RestRequestOptions, "pathParams" | "query" | "body" | "headers">

export interface RestToolConfig<TArgs extends ToolArgs = ToolArgs, TRaw = unknown, TOut = unknown> {
  name: string
  description: string
  category?: string
  method: HttpMethod
  /** URL template relative to the client's baseUrl, e.g. `/orders/{orderId}`. */
  path: string
  inputSchema?: ZodRawShape
  /**
   * Map validated args to request parts. If omitted, a method-dependent
   * default is used: path placeholders consume matching args, the rest
   * become `query` (GET/DELETE) or `body` (POST/PUT/PATCH).
   */
  buildRequest?: (args: TArgs) => RequestParts
  /**
   * Transform the raw response before handing it to the LLM. Use this to
   * reduce field surface — the main context-hygiene lever.
   */
  projection?: (raw: TRaw, args: TArgs) => TOut
  annotations?: {
    readOnlyHint?: boolean
    destructiveHint?: boolean
    idempotentHint?: boolean
    openWorldHint?: boolean
  }
  formatResult?: (result: TOut, args: TArgs) => string
}

/**
 * Produce a `ToolConfig<RestClient>` that the standard `createToolRegistrar`
 * can register. This keeps REST tools on the same registration path as
 * hand-written tools — same error handling, same result formatting.
 *
 * Typical usage:
 *
 * ```ts
 * const client = createRestClient({ baseUrl, auth: { mode: "bearer", token } })
 * const register = createToolRegistrar(server, client)
 * register(createRestTool({
 *   name: "get_order",
 *   description: "Fetch an order by ID.",
 *   method: "GET",
 *   path: "/orders/{orderId}",
 *   inputSchema: { orderId: z.string() },
 *   projection: (raw: Order) => ({ id: raw.id, total: raw.totalAmount }),
 * }))
 * ```
 */
export function createRestTool<TArgs extends ToolArgs = ToolArgs, TRaw = unknown, TOut = unknown>(
  config: RestToolConfig<TArgs, TRaw, TOut>,
): ToolConfig<RestClient> {
  const placeholders = extractPathPlaceholders(config.path)
  const method = config.method

  return {
    name: config.name,
    description: config.description,
    category: config.category,
    inputSchema: config.inputSchema,
    annotations: config.annotations,
    handler: async (client, args) => {
      const typedArgs = args as TArgs
      const parts = config.buildRequest
        ? config.buildRequest(typedArgs)
        : defaultBuildRequest(method, placeholders, typedArgs)
      const raw = await client.request<TRaw>({
        method,
        path: config.path,
        pathParams: parts.pathParams,
        query: parts.query,
        body: parts.body,
        headers: parts.headers,
      })
      if (raw === undefined) return undefined
      return config.projection ? config.projection(raw, typedArgs) : raw
    },
    formatResult: config.formatResult
      ? (result, args) => config.formatResult!(result as TOut, args as TArgs)
      : undefined,
  }
}

function extractPathPlaceholders(path: string): Set<string> {
  const out = new Set<string>()
  for (const match of path.matchAll(/\{([^}]+)\}/g)) {
    const name = match[1]
    if (name) out.add(name)
  }
  return out
}

function defaultBuildRequest(
  method: HttpMethod,
  placeholders: Set<string>,
  args: ToolArgs,
): RequestParts {
  const pathParams: Record<string, string | number> = {}
  const rest: Record<string, unknown> = {}

  for (const [key, value] of Object.entries(args)) {
    if (placeholders.has(key)) {
      pathParams[key] = value as string | number
    } else {
      rest[key] = value
    }
  }

  const hasRest = Object.keys(rest).length > 0
  if (method === "GET" || method === "DELETE") {
    return {
      pathParams,
      query: hasRest ? (rest as Record<string, QueryValue | QueryValue[]>) : undefined,
    }
  }
  return { pathParams, body: hasRest ? rest : undefined }
}
