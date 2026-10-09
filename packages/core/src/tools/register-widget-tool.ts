import { type MCPServer, type ToolAnnotations, type ToolRef } from "mcp-use"
import { z } from "zod"
import { appsSdkMeta, viewResourceUri, type WidgetToolMetaDefaults } from "../types/meta.js"
import { withToolErrors } from "./with-tool-errors.js"
import type { ToolArgs } from "./register-tool.js"
import {
  registrarInputSchema,
  type HandlerUser,
  type ToolHandlerContext,
  type ToolRegistrarOptions,
  type TypedToolRefOptions,
  type WidgetToolDefinitionPassthrough,
  type ZodRawShape,
} from "./registrar-shared.js"

interface WidgetToolResult {
  text: string
  structuredContent: Record<string, unknown>
}

/**
 * Who may call or see the tool. `"app"` hides the tool from the LLM tool
 * surface while keeping it callable from a widget (emitted natively by
 * mcp-use as `_meta.ui.visibility: ["app"]`); `"model"` exposes it to the LLM
 * and binds a view so the host renders its result.
 */
export type WidgetToolVisibility = "app" | "model"

export interface WidgetToolConfig<
  TClient,
  TShape extends ZodRawShape = ZodRawShape,
  TUser = unknown,
> {
  name: string
  title?: string
  description: string
  inputSchema?: TShape
  /** MCP tool annotations (e.g. `readOnlyHint`) advertised to the host. */
  annotations?: ToolAnnotations
  /**
   * Defaults to `"app"` (the historical behaviour — widget tools are
   * app-only). Use `"model"` for a widget-RENDERING tool: it is bound to its
   * own view (named after the tool) and gets the Apps SDK `openai/*` keys.
   */
  visibility?: WidgetToolVisibility
  /**
   * Structured-output schema. Model-visible (view-bound) tools require one —
   * mcp-use refuses a `view` binding without it — so the registrar defaults
   * to a passthrough object matching `WidgetToolResult.structuredContent`.
   * Declare a precise schema to give hosts and view hooks typed output.
   */
  outputSchema?: z.ZodTypeAny
  /**
   * Extra `_meta` entries merged flat into the emitted `_meta`, alongside the
   * `openai/*` block this registrar builds (collisions: the registrar wins).
   * The `ui` namespace is owned by mcp-use (derived from `view`/`visibility`)
   * and must not be stamped here.
   */
  meta?: Record<string, unknown>
  /**
   * Host status line while the tool call runs
   * (`openai/toolInvocation/invoking`). Defaults to `Loading <title>...`.
   * Only emitted on model-visible widget tools.
   */
  invoking?: string
  /**
   * Host status line once the tool call finished
   * (`openai/toolInvocation/invoked`). Defaults to `<title> ready`.
   * Only emitted on model-visible widget tools.
   */
  invoked?: string
  /**
   * Reject unknown input keys with a tool error naming the valid keys
   * instead of silently stripping them (`additionalProperties: false` on the
   * advertised schema). Overrides the registrar's `strictInput` option; off
   * by default in 2.x.
   */
  strictInput?: boolean
  /**
   * Every other mcp-use `ToolDefinition` field, forwarded verbatim to
   * `server.tool` — e.g. `securitySchemes`. `title`, `visibility`, `view`
   * and `_meta` stay registrar-derived (use `title` / `visibility` / `meta`).
   */
  definition?: WidgetToolDefinitionPassthrough
  /**
   * The tool body. `ctx` is mcp-use's per-call context ({@link ToolHandlerContext});
   * always passed by the registrar, optional in the type so handlers stay
   * directly callable as `(client, params)`.
   */
  handler: (
    client: TClient,
    params: ToolArgs<TShape>,
    ctx?: ToolHandlerContext<TUser>,
  ) => Promise<WidgetToolResult>
}

/**
 * The `ToolRef` output type of a widget tool: its declared `outputSchema`,
 * else the `structuredContent` record every widget handler returns.
 */
export type WidgetToolOutput<TOutput> = [TOutput] extends [z.ZodTypeAny]
  ? z.output<TOutput>
  : WidgetToolResult["structuredContent"]

/**
 * The `register` function {@link createWidgetToolRegistrar} returns. Its
 * static return type is `void` (wrapper-compatible, like `ToolRegistrar`);
 * at runtime it returns the mcp-use `ToolRef`. Pass `toolRefs: true` for
 * {@link TypedWidgetToolRegistrar}.
 */
export type WidgetToolRegistrar<TClient, TUser = unknown> = <
  TShape extends ZodRawShape = ZodRawShape,
>(
  config: WidgetToolConfig<TClient, TShape, TUser>,
) => void

/** The `ToolRef`-returning widget registrar (`toolRefs: true`). */
export type TypedWidgetToolRegistrar<TClient, TUser = unknown> = <
  TShape extends ZodRawShape = ZodRawShape,
  const TName extends string = string,
  TOutput extends z.ZodTypeAny | undefined = undefined,
>(
  config: WidgetToolConfig<TClient, TShape, TUser> & { name: TName; outputSchema?: TOutput },
) => ToolRef<TName, ToolArgs<TShape>, WidgetToolOutput<TOutput>>

/**
 * Registrar for widget tools against mcp-use's native view binding.
 *
 * Model-visible tools are bound to a view named after the tool
 * (`view: { name: <tool name> }`); mcp-use derives the MCP Apps wire keys
 * (`_meta.ui.resourceUri`, flat `ui/resourceUri`) from that binding, and the
 * registrar adds the Apps SDK `openai/*` keys pointing at the same resource
 * (`viewResourceUri(<tool name>)`). App-only tools carry the native
 * `visibility: "app"` and no view — their results feed an already-rendered
 * widget via `callTool`.
 *
 * `createFrameworkApp` collects every `view` binding registered this way and
 * primes the view registry with the shared app bundle, so each bound name
 * resolves to the same compiled widget code.
 *
 * Handlers receive `(client, params, ctx)` — `ctx` is mcp-use's per-call
 * context. `options.strictInput` sets the default for every tool's
 * `strictInput`; `options.toolRefs` types `register()`'s return value as the
 * tool's `ToolRef` (returned at runtime either way).
 */
export function createWidgetToolRegistrar<TClient, TUser = never>(
  server: MCPServer<TUser>,
  client: TClient,
  metaDefaults: WidgetToolMetaDefaults | undefined,
  options: TypedToolRefOptions,
): TypedWidgetToolRegistrar<TClient, HandlerUser<TUser>>
export function createWidgetToolRegistrar<TClient, TUser = never>(
  server: MCPServer<TUser>,
  client: TClient,
  metaDefaults?: WidgetToolMetaDefaults,
  options?: ToolRegistrarOptions,
): WidgetToolRegistrar<TClient, HandlerUser<TUser>>
export function createWidgetToolRegistrar<TClient, TUser = never>(
  server: MCPServer<TUser>,
  client: TClient,
  metaDefaults?: WidgetToolMetaDefaults,
  options: ToolRegistrarOptions = {},
): TypedWidgetToolRegistrar<TClient, HandlerUser<TUser>> {
  // Registration is independent of the OAuth user type, which only shapes
  // the callback ctx; the ctx is handed on typed by the registrar instead.
  const target = server as unknown as MCPServer

  function register(
    config: WidgetToolConfig<TClient, ZodRawShape, HandlerUser<TUser>>,
  ): ToolRef<string, Record<string, unknown>, unknown> {
    const model = config.visibility === "model"
    // Every registrar-owned key is set explicitly in both branches — undefined
    // included — so a cast or plain-JS `definition` cannot smuggle one in.
    const definition = {
      ...config.definition,
      name: config.name,
      title: config.title,
      description: config.description,
      inputSchema: registrarInputSchema(
        config.inputSchema,
        config.strictInput ?? options.strictInput ?? false,
      ),
      // mcp-use's alias: it reads `inputSchema ?? schema`.
      schema: undefined,
      annotations: config.annotations,
    }

    // The SDK validates params against the schema above before the callback
    // runs; the public `register` is generic over that shape, this
    // implementation sees the erased `ToolArgs`.
    const callback = withToolErrors(async (params: ToolArgs, ctx?: unknown) => {
      const result = await config.handler(
        client,
        params,
        ctx as ToolHandlerContext<HandlerUser<TUser>> | undefined,
      )
      return {
        content: [{ type: "text" as const, text: result.text }],
        structuredContent: result.structuredContent,
      }
    })

    if (!model) {
      return target.tool(
        {
          ...definition,
          visibility: "app",
          view: undefined,
          outputSchema: config.outputSchema,
          _meta: config.meta,
        },
        callback,
      )
    }

    return target.tool(
      {
        ...definition,
        // Host default: callable by the model (no `_meta.ui.visibility`).
        visibility: undefined,
        view: {
          name: config.name,
          description: config.description,
          ...(metaDefaults?.viewCsp ? { csp: metaDefaults.viewCsp } : {}),
        },
        // A view binding requires an outputSchema; `passthrough` matches the
        // free-form `WidgetToolResult.structuredContent` without stripping
        // keys on SDK-side validation.
        outputSchema: config.outputSchema ?? z.object({}).passthrough(),
        _meta: {
          ...config.meta,
          ...appsSdkMeta({
            resourceUri: viewResourceUri(config.name),
            title: config.title ?? config.name,
            invoking: config.invoking,
            invoked: config.invoked,
            widgetDescription: config.description,
            widgetCSP: metaDefaults?.widgetCSP,
          }),
        },
      },
      callback,
    )
  }

  return register as unknown as TypedWidgetToolRegistrar<TClient, HandlerUser<TUser>>
}
