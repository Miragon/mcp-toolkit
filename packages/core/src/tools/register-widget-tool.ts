import { type MCPServer, type ToolAnnotations } from "mcp-use"
import { z } from "zod"
import { appsSdkMeta, viewResourceUri, type WidgetToolMetaDefaults } from "../types/meta.js"
import { withToolErrors } from "./with-tool-errors.js"
import type { ToolArgs } from "./register-tool.js"

type ZodRawShape = Record<string, z.ZodTypeAny>

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- MCP SDK hands the callback params as Record<string, any> after zod validation; internal SDK-facing type only.
type LooseToolArgs = Record<string, any>

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

export interface WidgetToolConfig<TClient, TShape extends ZodRawShape = ZodRawShape> {
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
  handler: (client: TClient, params: ToolArgs<TShape>) => Promise<WidgetToolResult>
}

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
 */
export function createWidgetToolRegistrar<TClient>(
  server: MCPServer,
  client: TClient,
  metaDefaults?: WidgetToolMetaDefaults,
) {
  return function register<TShape extends ZodRawShape = ZodRawShape>(
    config: WidgetToolConfig<TClient, TShape>,
  ) {
    const model = config.visibility === "model"
    const definition = {
      name: config.name,
      title: config.title,
      description: config.description,
      inputSchema: config.inputSchema ? z.object(config.inputSchema) : undefined,
      annotations: config.annotations,
    }

    const callback = withToolErrors(async (looseParams: LooseToolArgs) => {
      // The SDK validates params against the schema above, so the loose
      // callback param is safely the handler's precise `ToolArgs<TShape>`.
      const result = await config.handler(client, looseParams as ToolArgs<TShape>)
      return {
        content: [{ type: "text" as const, text: result.text }],
        structuredContent: result.structuredContent,
      }
    })

    if (!model) {
      server.tool(
        {
          ...definition,
          visibility: "app",
          outputSchema: config.outputSchema,
          ...(config.meta ? { _meta: config.meta } : {}),
        },
        callback,
      )
      return
    }

    server.tool(
      {
        ...definition,
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
}
