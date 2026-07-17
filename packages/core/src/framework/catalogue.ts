import { executePipeline, type PipelineExecutionContext } from "../engine/pipeline-executor.js"
import { validatePipeline } from "../engine/context-builder.js"
import type { StepRegistry } from "../registry/step-registry.js"
import type { WidgetRegistry } from "../registry/widget-registry.js"
import type { PipelineStepRef } from "../types/pipeline.js"
import { isHostAliasWidget, isRemoteWidget } from "../types/widget.js"
import type { HostAliasWidgetInfo, RemoteWidgetInfo } from "./render-view.js"

export interface CatalogueInput {
  keys?: Record<string, unknown>
  steps?: PipelineStepRef[]
}

/**
 * A widget whose `requires` are satisfied by the keys the pipeline
 * exposes. The builder UI renders this as the palette.
 */
export interface ReachableWidget {
  id: string
  app: string
  requires: string[]
  size: string
  /**
   * JSON Schema mirrored from `WidgetDefinition.propsSchema`. Drives the
   * builder's per-cell "Configure" form so a user can author scoped
   * widget instances (e.g. one tab per `processDefinitionKey`) without
   * dropping into raw JSON. Absent when the widget takes no props.
   */
  propsSchema?: Record<string, unknown>
}

/**
 * A widget that is registered but not currently satisfiable. Surfaces in
 * the builder as "unreachable" with a hint about which keys are still
 * missing so users know what to seed or which step to add.
 */
export interface UnreachableWidget {
  id: string
  app: string
  requires: string[]
  size: string
  missingKeys: string[]
  propsSchema?: Record<string, unknown>
}

/**
 * Manifest entry for a registered pipeline step. The builder uses this
 * for its step-picker dropdown.
 */
export interface AvailableStep {
  id: string
  app: string
  dataType: string
  requires: string[]
  produces: string[]
}

/**
 * Every key the framework could see — produced by a step, consumed by a
 * step, or required by a widget — with attribution and a flag for
 * whether it currently lives in the pipeline context.
 */
export interface KeyCatalogEntry {
  key: string
  producedBySteps: string[]
  consumedBySteps: string[]
  consumedByWidgets: string[]
  inContext: boolean
}

export interface CataloguePayload {
  context: {
    keys: Record<string, unknown>
    stepIds: string[]
    stepData: Record<
      string,
      { data: unknown; keys: Record<string, unknown>; _app: string; _dataType: string }
    >
    errors: { stepId: string; reason: string }[]
  }
  reachableWidgets: ReachableWidget[]
  unreachableWidgets: UnreachableWidget[]
  availableSteps: AvailableStep[]
  keyCatalog: KeyCatalogEntry[]
  remoteWidgets: Record<string, RemoteWidgetInfo>
  /**
   * Manifest widgets that alias a host-bundled widget, keyed by alias id.
   * Like {@link remoteWidgets} this is the FULL palette (unlike
   * `render-view`, which filters to layout-referenced entries) so the
   * builder can offer every alias. The shell resolves `hostWidget` in its
   * own `widgets` map and merges `presetProps` under each cell's props.
   */
  aliasWidgets: Record<string, HostAliasWidgetInfo>
  /**
   * Pipeline validation issues from `validatePipeline`. The catalogue is
   * fail-soft (it still returns a usable palette even when the pipeline can't
   * fully resolve), so these are surfaced here structurally — not just in the
   * text summary — for the builder to show before the user commits. The same
   * pipeline would fail *hard* in `render-view`, so seeing these issues in the
   * builder warns the user the render path wouldn't run as configured.
   */
  validationIssues: string[]
}

export interface CatalogueOptions {
  input: CatalogueInput
  stepRegistry: StepRegistry
  widgetRegistry: WidgetRegistry
  appConfigs?: Record<string, unknown>
  /**
   * Per-request context (currently: the calling userId). Mirrors
   * {@link RenderViewOptions.ctx}.
   */
  ctx?: PipelineExecutionContext
}

/**
 * Computes everything the in-iframe LayoutBuilder needs to know:
 * the current pipeline context, the palette of reachable widgets, the
 * list of unreachable widgets with the keys they're missing, the full
 * step catalogue, and the key catalogue with producer/consumer
 * attribution.
 *
 * Intentionally NOT exposed to the LLM — the matching tool registrar
 * tags this with `visibility: ["app"]` so it never lands in the LLM's
 * tool-call surface. The LLM uses `render-view` for its work; the user
 * (via the iframe) calls this tool whenever they switch into Build mode
 * or edit keys/steps.
 *
 * Validation issues from `validatePipeline` are surfaced in the text
 * summary but don't abort — the catalogue is still useful even when
 * the pipeline can't fully resolve.
 */
export async function getBuilderCatalogue(options: CatalogueOptions) {
  const { input, stepRegistry, widgetRegistry, appConfigs, ctx } = options
  const initialKeys = input.keys ?? {}
  const pipelineConfig = { steps: input.steps }

  const validation = input.steps?.length
    ? validatePipeline(pipelineConfig, stepRegistry, Object.keys(initialKeys))
    : { valid: true, issues: [], availableKeys: Object.keys(initialKeys) }

  const context = await executePipeline({
    config: pipelineConfig,
    initialKeys,
    registry: stepRegistry,
    appConfigs,
    ctx,
  })

  const availableKeys = new Set<string>([...validation.availableKeys, ...Object.keys(context.keys)])

  const allWidgets = widgetRegistry.getAll()
  const reachableDefs = widgetRegistry.findByRequiredKeys([...availableKeys])
  const reachableIds = new Set(reachableDefs.map((w) => w.id))

  const reachableWidgets: ReachableWidget[] = reachableDefs.map((w) => ({
    id: w.id,
    app: appOf(w.id),
    requires: w.requires,
    size: w.size,
    ...(w.propsSchema ? { propsSchema: w.propsSchema } : {}),
  }))

  const unreachableWidgets: UnreachableWidget[] = allWidgets
    .filter((w) => !reachableIds.has(w.id))
    .map((w) => ({
      id: w.id,
      app: appOf(w.id),
      requires: w.requires,
      size: w.size,
      missingKeys: w.requires.filter((k) => !availableKeys.has(k)),
      ...(w.propsSchema ? { propsSchema: w.propsSchema } : {}),
    }))

  const availableSteps: AvailableStep[] = stepRegistry.getAll().map((s) => ({
    id: s.id,
    app: appOf(s.id),
    dataType: s.dataType,
    requires: s.requires,
    produces: s.produces,
  }))

  const stepContracts = stepRegistry.getKeyContracts()
  const keys = new Set<string>(availableKeys)
  for (const c of stepContracts) keys.add(c.key)
  const widgetConsumers = new Map<string, string[]>()
  for (const widget of allWidgets) {
    for (const key of widget.requires) {
      keys.add(key)
      const list = widgetConsumers.get(key) ?? []
      if (!list.includes(widget.id)) list.push(widget.id)
      widgetConsumers.set(key, list)
    }
  }
  const stepContractsByKey = new Map(stepContracts.map((c) => [c.key, c]))
  const keyCatalog: KeyCatalogEntry[] = [...keys]
    .sort((a, b) => a.localeCompare(b))
    .map((key) => {
      const contract = stepContractsByKey.get(key)
      return {
        key,
        producedBySteps: contract?.producedBy ?? [],
        consumedBySteps: contract?.consumedBy ?? [],
        consumedByWidgets: widgetConsumers.get(key) ?? [],
        inContext: availableKeys.has(key),
      }
    })

  const remoteWidgets: Record<string, RemoteWidgetInfo> = {}
  for (const widget of allWidgets) {
    if (isRemoteWidget(widget)) {
      remoteWidgets[widget.id] = { bundle: widget.bundle, moduleId: widget.moduleId }
    }
  }

  const aliasWidgets: Record<string, HostAliasWidgetInfo> = {}
  for (const widget of allWidgets) {
    if (isHostAliasWidget(widget)) {
      aliasWidgets[widget.id] = {
        hostWidget: widget.hostWidget,
        ...(widget.presetProps ? { presetProps: widget.presetProps } : {}),
      }
    }
  }

  const textSummary = [
    `Reachable widgets: ${reachableWidgets.length}`,
    `Keys: ${[...availableKeys].join(", ") || "none"}`,
    validation.issues.length > 0 ? `Pipeline issues: ${validation.issues.join("; ")}` : "",
    context.errors.length > 0
      ? `Step errors: ${context.errors.map((e) => `${e.stepId}: ${e.reason}`).join("; ")}`
      : "",
  ]
    .filter(Boolean)
    .join("\n")

  return {
    content: [{ type: "text" as const, text: textSummary }],
    structuredContent: {
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
      reachableWidgets,
      unreachableWidgets,
      availableSteps,
      keyCatalog,
      remoteWidgets,
      aliasWidgets,
      validationIssues: validation.issues,
    },
  }
}

/**
 * Splits a namespaced id like `"lexoffice:load-invoice"` into the
 * leading namespace. Falls back to the full id when no colon is present.
 */
function appOf(id: string): string {
  const colon = id.indexOf(":")
  return colon >= 0 ? id.slice(0, colon) : id
}
