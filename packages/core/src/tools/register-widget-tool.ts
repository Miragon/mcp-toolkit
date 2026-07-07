import { type MCPServer, type ToolAnnotations } from "mcp-use/server"
import { z } from "zod"
import { uiMeta, type WidgetToolMetaDefaults } from "../types/meta.js"
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
 * Tool visibility per SEP-1865 (`_meta.ui.visibility`). `"app"` hides the tool
 * from the LLM tool surface while keeping it callable from a widget; `"model"`
 * exposes it to the LLM. Pass an array to advertise both surfaces.
 */
export type WidgetToolVisibility = "app" | "model" | ("app" | "model")[]

export interface WidgetToolConfig<TClient, TShape extends ZodRawShape = ZodRawShape> {
  name: string
  title?: string
  description: string
  inputSchema?: TShape
  /** MCP tool annotations (e.g. `readOnlyHint`) advertised to the host. */
  annotations?: ToolAnnotations
  /**
   * SEP-1865 visibility. Defaults to `"app"` (the historical behaviour — widget
   * tools are app-only). Use `"model"` to expose the tool to the LLM; in that
   * case the `_meta.ui` carries only `{ resourceUri }` and no `visibility`.
   */
  visibility?: WidgetToolVisibility
  /**
   * Extra `_meta` entries merged flat into the emitted `_meta`, alongside the
   * `ui` block this registrar builds. The `ui` key is reserved for the
   * registrar; collisions are overwritten by the registrar's `ui`.
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

/** Normalizes the {@link WidgetToolConfig.visibility} option into a flag set. */
function resolveVisibility(visibility: WidgetToolVisibility | undefined): {
  app: boolean
  model: boolean
} {
  const list =
    visibility === undefined ? ["app"] : Array.isArray(visibility) ? visibility : [visibility]
  return { app: list.includes("app"), model: list.includes("model") }
}

export function createWidgetToolRegistrar<TClient>(
  server: MCPServer,
  client: TClient,
  resourceUri: string,
  metaDefaults?: WidgetToolMetaDefaults,
) {
  return function register<TShape extends ZodRawShape = ZodRawShape>(
    config: WidgetToolConfig<TClient, TShape>,
  ) {
    const { app, model } = resolveVisibility(config.visibility)
    // `"model"`-visible tools must not carry the app-only `visibility` marker so
    // the LLM still sees them; otherwise mark app-only. The `resourceUri` is
    // always present so the host knows which bundle renders the result.
    // Model-visible tools additionally get the dual-protocol widget contract
    // (flat `ui/resourceUri` + `openai/*` keys) ext-apps hosts key on.
    const ui = uiMeta({
      resourceUri,
      appOnly: app && !model,
      title: config.title ?? config.name,
      invoking: config.invoking,
      invoked: config.invoked,
      widgetDescription: config.description,
      widgetCSP: metaDefaults?.widgetCSP,
    })

    server.tool(
      {
        name: config.name,
        title: config.title,
        description: config.description,
        schema: config.inputSchema ? z.object(config.inputSchema) : undefined,
        annotations: config.annotations,
        _meta: { ...config.meta, ...ui },
      },
      // The SDK validates params against the schema above, so the loose
      // callback param is safely the handler's precise `ToolArgs<TShape>`.
      withToolErrors(async (looseParams: LooseToolArgs) => {
        const result = await config.handler(client, looseParams as ToolArgs<TShape>)
        return {
          content: [{ type: "text" as const, text: result.text }],
          structuredContent: result.structuredContent,
        }
      }),
    )
  }
}
