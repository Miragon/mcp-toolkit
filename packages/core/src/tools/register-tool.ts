import { type MCPServer, type ToolRef } from "mcp-use"
import { z } from "zod"
import { objectResult, textResult } from "./tool-results.js"
import { withToolErrors } from "./with-tool-errors.js"
import {
  registrarInputSchema,
  type HandlerUser,
  type ToolDefinitionPassthrough,
  type ToolHandlerContext,
  type ToolRegistrarOptions,
  type TypedToolRefOptions,
  type ZodRawShape,
} from "./registrar-shared.js"

/**
 * The validated args a handler receives. When an `inputSchema` shape is
 * declared, this is inferred from it (`z.infer`), so handlers get precise types
 * for free instead of a loose `Record<string, any>`. With no `inputSchema` it
 * falls back to a permissive record, matching the pre-generic behaviour.
 */
export type ToolArgs<TShape extends ZodRawShape = ZodRawShape> = z.infer<z.ZodObject<TShape>>

export interface ToolConfig<TClient, TShape extends ZodRawShape = ZodRawShape, TUser = unknown> {
  name: string
  description: string
  category?: string
  inputSchema?: TShape
  /**
   * Zod schema describing the tool's structured output. Mirrored into the
   * MCP `outputSchema` advertised to clients and used to populate
   * `structuredContent` on each response.
   *
   * If you pass a `z.array(...)`, the schema is auto-wrapped to
   * `z.object({ data: <array> })` because MCP requires `structuredContent`
   * to be an object. The runtime wrapping happens automatically too — your
   * handler can return either the bare array or `{ data: [...] }`.
   */
  outputSchema?: z.ZodTypeAny
  annotations?: {
    readOnlyHint?: boolean
    destructiveHint?: boolean
    idempotentHint?: boolean
    openWorldHint?: boolean
  }
  /**
   * Reject unknown input keys instead of silently stripping them: the input
   * schema is advertised with `additionalProperties: false`, and a call with
   * an unknown key fails with a tool error naming the valid keys. Overrides
   * the registrar's `strictInput` option; off by default in 2.x.
   */
  strictInput?: boolean
  /**
   * Every other mcp-use `ToolDefinition` field, forwarded verbatim to
   * `server.tool` — `title`, `_meta`, `visibility`, `securitySchemes`,
   * `view`, … The registrar-derived keys (name, description, schemas,
   * annotations) always win.
   */
  definition?: ToolDefinitionPassthrough
  /**
   * The tool body. `ctx` is mcp-use's per-call context ({@link ToolHandlerContext}):
   * `signal` for cancellation, `reportProgress`, `sendLog`, `client`, `auth`.
   * The registrar always passes it; it is optional in the type so handlers
   * stay directly callable as `(client, args)` — e.g. from unit tests.
   */
  handler: (
    client: TClient,
    args: ToolArgs<TShape>,
    ctx?: ToolHandlerContext<TUser>,
  ) => Promise<unknown>
  formatResult?: (result: unknown, args: ToolArgs<TShape>) => string
}

export interface RegisteredToolMeta {
  name: string
  category?: string
}

/**
 * The structured output a registrar tool advertises for its `outputSchema`
 * — the `ToolRef` output type. Arrays are wrapped into `{ data }` exactly
 * like the advertised schema; no `outputSchema` means `never`, mirroring
 * mcp-use's own `InferToolOutput`.
 */
export type RegistrarToolOutput<TOutput> = [TOutput] extends [z.ZodArray<z.ZodTypeAny>]
  ? { data: z.output<TOutput> }
  : [TOutput] extends [z.ZodTypeAny]
    ? z.output<TOutput>
    : never

/**
 * The `register` function {@link createToolRegistrar} returns. Its static
 * return type is `void` so hand-written wrappers typed as
 * `ReturnType<typeof createToolRegistrar<C>>` (e.g. a toolset filter that
 * skips registration) keep compiling; at runtime it returns the mcp-use
 * `ToolRef`. Pass `toolRefs: true` for {@link TypedToolRegistrar}.
 */
export interface ToolRegistrar<TClient, TUser = unknown> {
  <TShape extends ZodRawShape = ZodRawShape>(config: ToolConfig<TClient, TShape, TUser>): void
  getRegisteredTools: () => RegisteredToolMeta[]
}

/**
 * The `register` function `createToolRegistrar(server, client, { toolRefs: true })`
 * returns: each call returns the tool's mcp-use `ToolRef`, typed with the
 * literal tool name, the inferred input and the structured output — export
 * it for `mcp-env.d.ts` / typed `useCallTool`, like a raw `server.tool` ref.
 */
export interface TypedToolRegistrar<TClient, TUser = unknown> {
  <
    TShape extends ZodRawShape = ZodRawShape,
    const TName extends string = string,
    TOutput extends z.ZodTypeAny | undefined = undefined,
  >(
    config: ToolConfig<TClient, TShape, TUser> & { name: TName; outputSchema?: TOutput },
  ): ToolRef<TName, ToolArgs<TShape>, RegistrarToolOutput<TOutput>>
  getRegisteredTools: () => RegisteredToolMeta[]
}

function wrapArraySchema(schema: z.ZodTypeAny | undefined): z.ZodTypeAny | undefined {
  if (!schema) return undefined
  return schema instanceof z.ZodArray ? z.object({ data: schema }) : schema
}

/**
 * Coerces a handler result into the `structuredContent` object shape MCP
 * requires, mirroring {@link wrapArraySchema}: bare arrays become `{ data }`,
 * objects pass through.
 *
 * A declared `outputSchema` is a promise to the client that this tool emits an
 * *object* `structuredContent`. If the handler instead returns a scalar,
 * `null`, or `undefined`, the SDK would reject the response with an opaque
 * protocol error ("has an output schema but no structured content" / "invalid
 * structured content"). We turn that into a clear, house-style tool error
 * instead — thrown here and caught by {@link withToolErrors}, which surfaces it
 * as an `isError` result the SDK passes through without output-schema
 * validation.
 */
function toStructuredContent(result: unknown, toolName: string): Record<string, unknown> {
  if (Array.isArray(result)) return { data: result }
  if (result !== null && typeof result === "object") return result as Record<string, unknown>
  const kind = result === null ? "null" : typeof result
  throw new Error(
    `Tool "${toolName}" declares an outputSchema but its handler returned a ${kind} value; ` +
      `structured output must be an object or array.`,
  )
}

/**
 * Registrar for a module's domain tools: builds the input/output schemas,
 * wraps the handler in {@link withToolErrors}, and mirrors the result into
 * `structuredContent`. Handlers receive `(client, args, ctx)` — `ctx` is
 * mcp-use's per-call context. `options.strictInput` sets the default for
 * every tool's `strictInput`; `options.toolRefs` types `register()`'s return
 * value as the tool's `ToolRef`.
 */
export function createToolRegistrar<TClient, TUser = never>(
  server: MCPServer<TUser>,
  client: TClient,
  options: TypedToolRefOptions,
): TypedToolRegistrar<TClient, HandlerUser<TUser>>
export function createToolRegistrar<TClient, TUser = never>(
  server: MCPServer<TUser>,
  client: TClient,
  options?: ToolRegistrarOptions,
): ToolRegistrar<TClient, HandlerUser<TUser>>
export function createToolRegistrar<TClient, TUser = never>(
  server: MCPServer<TUser>,
  client: TClient,
  options: ToolRegistrarOptions = {},
): TypedToolRegistrar<TClient, HandlerUser<TUser>> {
  const registeredTools: RegisteredToolMeta[] = []
  // Registration is independent of the OAuth user type, which only shapes
  // the callback ctx; the ctx is handed on typed by the registrar instead.
  const target = server as unknown as MCPServer

  function register(config: ToolConfig<TClient, ZodRawShape, HandlerUser<TUser>>): ToolRef {
    registeredTools.push({ name: config.name, category: config.category })
    return target.tool(
      {
        ...config.definition,
        name: config.name,
        description: config.description,
        inputSchema: registrarInputSchema(
          config.inputSchema,
          config.strictInput ?? options.strictInput ?? false,
        ),
        outputSchema: wrapArraySchema(config.outputSchema),
        annotations: config.annotations,
      },
      // The SDK validates args against the schema above before the callback
      // runs; the public `register` is generic over that shape, this
      // implementation sees the erased `ToolArgs`.
      withToolErrors(async (args: ToolArgs, ctx?: unknown) => {
        const result = await config.handler(
          client,
          args,
          ctx as ToolHandlerContext<HandlerUser<TUser>> | undefined,
        )
        if (config.formatResult) {
          const formatted = textResult(config.formatResult(result, args))
          // When an outputSchema is declared the tool promised structured
          // output, so mirror the raw result into structuredContent alongside
          // the human-readable text instead of dropping it. Without an
          // outputSchema the formatResult path stays text-only as before.
          if (config.outputSchema) {
            return { ...formatted, structuredContent: toStructuredContent(result, config.name) }
          }
          return formatted
        }
        if (Array.isArray(result)) {
          // Wrap here rather than delegating to mcp-use's `array()` helper.
          // Up to 1.34 that helper produced `structuredContent: { data: [...] }`;
          // the 2.x shim emits the bare array instead, which contradicts the
          // `z.object({ data: <array> })` outputSchema `wrapArraySchema`
          // declares — and MCP requires an object there regardless. Owning the
          // wrap keeps the declared schema and the emitted payload in step.
          return objectResult(toStructuredContent(result, config.name))
        }
        if (result !== null && typeof result === "object") {
          return objectResult(result as Record<string, unknown>)
        }
        // A declared outputSchema requires an object `structuredContent`; a
        // scalar/null/undefined result would make the SDK reject the response
        // with an opaque protocol error. Surface a clear tool error instead
        // (see toStructuredContent). Without an outputSchema, the text-only
        // fallbacks below are valid.
        if (config.outputSchema) {
          return objectResult(toStructuredContent(result, config.name))
        }
        if (result !== null && result !== undefined) {
          return textResult(JSON.stringify(result, null, 2))
        }
        return textResult("Success (no content returned)")
      }),
    )
  }

  register.getRegisteredTools = () => registeredTools

  return register as unknown as TypedToolRegistrar<TClient, HandlerUser<TUser>>
}
