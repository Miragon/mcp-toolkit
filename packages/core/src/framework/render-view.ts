import { executePipeline, type PipelineExecutionContext } from "../engine/pipeline-executor.js"
import { validatePipeline } from "../engine/context-builder.js"
import type { StepRegistry } from "../registry/step-registry.js"
import type { WidgetRegistry } from "../registry/widget-registry.js"
import type { PipelineStepRef } from "../types/pipeline.js"
import type { ViewStructuredContent } from "../types/view-data.js"
import { isRemoteWidget } from "../types/widget.js"
import { collectLayoutWidgets } from "./view-builders.js"
import type { LayoutConfig } from "./layout-types.js"

export interface RenderViewInput {
  keys?: Record<string, unknown>
  steps?: PipelineStepRef[]
  layout: LayoutConfig
  title?: string
}

/**
 * Bundle metadata for a widget whose code lives on an upstream MCP server.
 * The browser-side widget loader reads `bundle` via the upstream identified
 * by `moduleId` and dynamically imports the result.
 */
export interface RemoteWidgetInfo {
  bundle: string
  moduleId: string
}

export interface RenderViewOptions {
  input: RenderViewInput
  stepRegistry: StepRegistry
  widgetRegistry?: WidgetRegistry
  appConfigs?: Record<string, Record<string, unknown>>
  /**
   * Per-request context (currently: the calling userId) that the pipeline
   * executor uses to pre-bind user-scoped `callTool` closures on step
   * `appConfig`s. Pass it through from the tool handler's
   * `ctx.auth?.user?.userId`.
   */
  ctx?: PipelineExecutionContext
  /**
   * Whether the in-iframe visual builder is usable on this server (i.e.
   * `app.builder` is on and `get-builder-catalogue` is registered). Echoed
   * into `structuredContent.builderAvailable` so the `McpAppView` shell shows
   * its Build affordance only when the builder can actually be serviced.
   * Defaults to `false` — `createFrameworkApp` passes the real value through
   * from `options.app.builder`.
   */
  builderAvailable?: boolean
}

/**
 * Executes a pipeline of steps to populate the keys map and returns a payload
 * ready to be embedded into an MCP App widget. The resulting `structuredContent`
 * is consumed by the `McpAppView` component in `@miragon/mcp-toolkit-ui`.
 */
export async function renderView(options: RenderViewOptions) {
  const { input, stepRegistry, widgetRegistry, appConfigs, ctx, builderAvailable } = options
  const initialKeys = input.keys ?? {}
  const pipelineConfig = { steps: input.steps }

  if (input.steps?.length) {
    const validation = validatePipeline(pipelineConfig, stepRegistry, Object.keys(initialKeys))
    if (!validation.valid) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Pipeline validation failed: ${validation.issues.join("; ")}`,
          },
        ],
        isError: true,
      }
    }
  }

  const context = await executePipeline({
    config: pipelineConfig,
    initialKeys,
    registry: stepRegistry,
    appConfigs,
    ctx,
  })

  const textSummary = [
    input.title ?? "View",
    `Steps: ${Object.keys(context.steps).join(", ") || "none"}`,
    `Keys: ${Object.keys(context.keys).join(", ")}`,
    context.errors.length > 0
      ? `Errors: ${context.errors.map((e) => `${e.stepId}: ${e.reason}`).join("; ")}`
      : "",
  ]
    .filter(Boolean)
    .join("\n")

  // Advertise bundle metadata only for the upstream-hosted widgets the layout
  // actually references — not every remote widget in the registry. The
  // browser-side loader (`McpAppView`) fetches each advertised bundle, so
  // shipping the full registry would make a single-widget view pull every
  // upstream bundle's metadata (and, on `useToolQuery`-driven refreshes, set
  // up unused loads). The in-iframe builder gets its full remote palette from
  // `get-builder-catalogue` instead (see `catalogue.ts`), so filtering here
  // doesn't starve build mode. Local widgets carry no bundle and are skipped.
  const remoteWidgets: Record<string, RemoteWidgetInfo> = {}
  if (widgetRegistry) {
    const layoutWidgetIds = new Set(collectLayoutWidgets(input.layout))
    for (const widget of widgetRegistry.getAll()) {
      if (layoutWidgetIds.has(widget.id) && isRemoteWidget(widget)) {
        remoteWidgets[widget.id] = { bundle: widget.bundle, moduleId: widget.moduleId }
      }
    }
  }

  const structuredContent: ViewStructuredContent = {
    _refreshParams: {
      keys: input.keys,
      steps: input.steps,
      layout: input.layout,
      title: input.title,
    },
    title: input.title,
    context: {
      keys: context.keys,
      stepIds: Object.keys(context.steps),
      stepData: Object.fromEntries(
        Object.entries(context.steps).map(([id, result]) => [
          id,
          {
            data: result.data,
            keys: result.keys,
            _app: result._app,
            _dataType: result._dataType,
          },
        ]),
      ),
      errors: context.errors,
    },
    layout: input.layout,
    remoteWidgets,
    builderAvailable: builderAvailable ?? false,
  }

  return {
    content: [{ type: "text" as const, text: textSummary }],
    structuredContent,
  }
}
