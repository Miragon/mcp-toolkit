import { executePipeline, type PipelineExecutionContext } from "../engine/pipeline-executor.js"
import { validatePipeline } from "../engine/context-builder.js"
import type { StepRegistry } from "../registry/step-registry.js"
import type { PipelineStepRef } from "../types/pipeline.js"
import type { LayoutConfig } from "./layout-types.js"

export interface RenderViewInput {
  keys?: Record<string, unknown>
  steps?: PipelineStepRef[]
  layout: LayoutConfig
  title?: string
}

/**
 * Executes a pipeline of steps to populate the keys map and returns a payload
 * ready to be embedded into an MCP App widget. The resulting `structuredContent`
 * is consumed by the `McpAppView` component in `@miragon/mcp-toolkit-ui`.
 *
 * `ctx` carries per-request info (currently: the calling userId) that the
 * pipeline executor uses to pre-bind user-scoped `callTool` closures on step
 * `appConfig`s. Pass it through from the tool handler's `ctx.auth?.user?.userId`.
 */
export async function renderView(
  input: RenderViewInput,
  stepRegistry: StepRegistry,
  appConfigs?: Record<string, Record<string, unknown>>,
  ctx?: PipelineExecutionContext,
) {
  const initialKeys = input.keys ?? {}
  const pipelineConfig = { steps: input.steps }

  if (input.steps?.length) {
    const validation = validatePipeline(pipelineConfig, stepRegistry, Object.keys(initialKeys))
    if (!validation.valid) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Pipeline validation failed: ${validation.issues.join(", ")}`,
          },
        ],
        isError: true,
      }
    }
  }

  const context = await executePipeline(pipelineConfig, initialKeys, stepRegistry, appConfigs, ctx)

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

  return {
    content: [{ type: "text" as const, text: textSummary }],
    structuredContent: {
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
    },
  }
}
