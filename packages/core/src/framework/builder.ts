import { executePipeline, type PipelineExecutionContext } from "../engine/pipeline-executor.js"
import { validatePipeline } from "../engine/context-builder.js"
import type { StepRegistry } from "../registry/step-registry.js"
import type { WidgetRegistry } from "../registry/widget-registry.js"
import type { PipelineStepRef } from "../types/pipeline.js"
import type { LayoutConfig } from "./layout-types.js"
import type { RemoteWidgetInfo } from "./render-view.js"

export interface BuildViewInput {
  keys?: Record<string, unknown>
  steps?: PipelineStepRef[]
  /** Optional draft layout to resume editing. Empty when starting from scratch. */
  layout?: LayoutConfig
  title?: string
}

/**
 * Manifest entry for a widget whose `requires` are satisfied by the keys
 * available after the declared steps would execute. The builder UI uses
 * this list to render its palette.
 */
export interface ReachableWidget {
  id: string
  app: string
  requires: string[]
  size: string
}

/**
 * Shape of `open-view-builder`'s structuredContent. Symmetric to
 * `renderView`'s payload so the `McpAppView` can reuse the same pipeline
 * wiring for live preview, then branch on `mode === "builder"` to render
 * the interactive composer instead of the static widget grid.
 */
export interface BuildViewPayload {
  _refreshParams: BuildViewInput
  mode: "builder"
  title?: string
  context: {
    keys: Record<string, unknown>
    stepIds: string[]
    stepData: Record<
      string,
      { data: unknown; keys: Record<string, unknown>; _app: string; _dataType: string }
    >
    errors: { stepId: string; reason: string }[]
  }
  layout?: LayoutConfig
  reachableWidgets: ReachableWidget[]
  remoteWidgets: Record<string, RemoteWidgetInfo>
}

/**
 * Companion to `renderView`: runs the pipeline to populate the live context,
 * then adds the catalogue of widgets whose `requires` are satisfied by the
 * pipeline's resolvable keys. The browser-side builder reads
 * `reachableWidgets` to populate its palette and uses `context.keys` to
 * render a WYSIWYG preview of the draft layout.
 *
 * Unlike `renderView`, a pipeline-validation failure does not abort the
 * response — the builder still needs the reachable-widget catalogue for
 * whatever keys _did_ resolve, plus the issue list for UI feedback.
 */
export async function buildView(
  input: BuildViewInput,
  stepRegistry: StepRegistry,
  widgetRegistry: WidgetRegistry,
  appConfigs?: Record<string, unknown>,
  ctx?: PipelineExecutionContext,
) {
  const initialKeys = input.keys ?? {}
  const pipelineConfig = { steps: input.steps }

  const validation = input.steps?.length
    ? validatePipeline(pipelineConfig, stepRegistry, Object.keys(initialKeys))
    : { valid: true, issues: [], availableKeys: Object.keys(initialKeys) }

  const context = await executePipeline(pipelineConfig, initialKeys, stepRegistry, appConfigs, ctx)

  // Union the statically-predicted keys (from validation) with what actually
  // resolved at runtime — covers both "step errored this round" and "initial
  // keys only, no steps" cases so the palette always reflects the maximal
  // key set the user can build against.
  const availableKeys = new Set<string>([...validation.availableKeys, ...Object.keys(context.keys)])

  const reachableWidgets: ReachableWidget[] = widgetRegistry
    .findByRequiredKeys([...availableKeys])
    .map((w) => ({
      id: w.id,
      app: w.id.split(":")[0],
      requires: w.requires,
      size: w.size,
    }))

  const remoteWidgets: Record<string, RemoteWidgetInfo> = {}
  for (const widget of widgetRegistry.getAll()) {
    if (widget.bundle && widget.moduleId) {
      remoteWidgets[widget.id] = { bundle: widget.bundle, moduleId: widget.moduleId }
    }
  }

  const textSummary = [
    input.title ? `Builder: ${input.title}` : "Builder",
    `Reachable widgets: ${reachableWidgets.length}`,
    `Keys: ${[...availableKeys].join(", ") || "none"}`,
    validation.issues.length > 0 ? `Pipeline issues: ${validation.issues.join("; ")}` : "",
    context.errors.length > 0
      ? `Step errors: ${context.errors.map((e) => `${e.stepId}: ${e.reason}`).join("; ")}`
      : "",
  ]
    .filter(Boolean)
    .join("\n")

  // Intentionally return an inline object literal (not a `const payload:
  // BuildViewPayload = …`) so TypeScript infers the structural shape and the
  // result is directly assignable to the MCP SDK's `Record<string, unknown>`
  // structuredContent contract. The `BuildViewPayload` type remains exported
  // for consumers typing their own props.
  return {
    content: [{ type: "text" as const, text: textSummary }],
    structuredContent: {
      _refreshParams: {
        keys: input.keys,
        steps: input.steps,
        layout: input.layout,
        title: input.title,
      },
      mode: "builder" as const,
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
      reachableWidgets,
      remoteWidgets,
    },
  }
}
