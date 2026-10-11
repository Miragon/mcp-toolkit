import type { StepRegistry } from "../registry/step-registry.js"
import type { WidgetRegistry } from "../registry/widget-registry.js"
import type { OptionalKeyDeclaration } from "../types/step.js"
import type { AppConfig } from "../types/config.js"
import { PROPS_SCHEMA_DISPLAY_KEYWORD } from "../types/display.js"

export interface FrameworkManifest {
  activeApps: string[]
  steps: {
    id: string
    app: string
    /** One-line description of what the step does. */
    description?: string
    dataType: string
    requires: string[]
    /**
     * Keys the step reads opportunistically (scoping/filter inputs) but does
     * not strictly need. Mirrors `PipelineStepDefinition.optionalKeys`.
     */
    optionalKeys?: OptionalKeyDeclaration[]
    produces: string[]
  }[]
  widgets: {
    id: string
    app: string
    /** One-line description of what the widget shows. */
    description?: string
    requires: string[]
    /**
     * Step `dataType`s the widget can render. Pair with `steps[].dataType`
     * to find which step populates this widget.
     */
    consumes?: string[]
    size: string
    /**
     * JSON Schema for the per-instance props the widget accepts via a
     * layout cell's `props` field. Omitted for widgets that take no
     * per-instance props. Same JSON-Schema contract the LLM already
     * understands from MCP tool input schemas, so it can construct scoped
     * views (e.g. one tab per `processDefinitionKey`) without guessing.
     * The properties' `x-display` texts (the builder's labels for people)
     * are left out, see {@link propsSchemaForModel}.
     */
    propsSchema?: Record<string, unknown>
  }[]
  pipelines: {
    id: string
    steps: { id: string; step: string; optional?: boolean }[]
  }[]
  keyContracts: {
    key: string
    producedBy: string[]
    consumedBy: string[]
    optionallyConsumedBy: string[]
  }[]
}

/**
 * Produces a JSON-serializable manifest of everything the framework currently
 * knows about: active apps, registered pipeline steps, available widgets, and
 * the key contracts derived from step `requires`/`produces`. Consumers expose
 * this via a `get-framework-manifest` tool so the LLM can learn what is
 * composable via `render-view`.
 */
export function getFrameworkManifest(
  stepRegistry: StepRegistry,
  widgetRegistry: WidgetRegistry,
  config: AppConfig,
): FrameworkManifest {
  return {
    activeApps: config.activeApps.map((a) => a.app),

    steps: stepRegistry.getAll().map((step) => ({
      id: step.id,
      app: appOf(step.id),
      ...(step.description ? { description: step.description } : {}),
      dataType: step.dataType,
      requires: step.requires,
      ...(step.optionalKeys && step.optionalKeys.length > 0
        ? { optionalKeys: step.optionalKeys }
        : {}),
      produces: step.produces,
    })),

    widgets: widgetRegistry.getAll().map((widget) => ({
      id: widget.id,
      app: appOf(widget.id),
      ...(widget.description ? { description: widget.description } : {}),
      requires: widget.requires,
      ...(widget.consumes && widget.consumes.length > 0 ? { consumes: widget.consumes } : {}),
      size: widget.size,
      ...(widget.propsSchema ? { propsSchema: propsSchemaForModel(widget.propsSchema) } : {}),
    })),

    pipelines: Object.entries(config.pipelines).map(([id, pipeline]) => ({
      id,
      steps: pipeline.steps ?? [],
    })),

    keyContracts: stepRegistry.getKeyContracts(),
  }
}

/**
 * A widget's `propsSchema` as the LLM reads it: each property without its
 * {@link PROPS_SCHEMA_DISPLAY_KEYWORD} (`x-display`) text. Those titles and
 * summaries label the builder's props sheet for people, in every locale; the
 * LLM reads the properties' `description`s. Every other keyword stays as the
 * widget declared it, and a schema without display text comes back unchanged
 * (the same object). Exported for its tests.
 */
export function propsSchemaForModel(schema: Record<string, unknown>): Record<string, unknown> {
  const properties = schema.properties
  if (!isRecord(properties)) return schema
  let stripped = false
  const forModel: Record<string, unknown> = {}
  for (const [name, property] of Object.entries(properties)) {
    if (isRecord(property) && PROPS_SCHEMA_DISPLAY_KEYWORD in property) {
      forModel[name] = Object.fromEntries(
        Object.entries(property).filter(([keyword]) => keyword !== PROPS_SCHEMA_DISPLAY_KEYWORD),
      )
      stripped = true
    } else {
      forModel[name] = property
    }
  }
  return stripped ? { ...schema, properties: forModel } : schema
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

/**
 * Splits a namespaced id like `"lexoffice:load-invoice"` into the
 * leading namespace. Falls back to the full id if no colon is present
 * (i.e. a malformed id) so callers always get a non-empty string.
 */
function appOf(id: string): string {
  const colon = id.indexOf(":")
  return colon >= 0 ? id.slice(0, colon) : id
}
