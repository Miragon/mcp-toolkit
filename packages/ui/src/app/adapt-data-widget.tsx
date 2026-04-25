import type { ComponentType } from "react"
import type { WidgetProps } from "@miragon/mcp-toolkit-core"
import type { WidgetComponent } from "./widget-renderer.js"

/**
 * Wraps a legacy "single-data" widget component with the signature
 * `({ data }: { data: T | null })` so it can be registered as a framework
 * `WidgetComponent` (which receives `WidgetProps = { keys, context }`).
 *
 * The adapter looks up the matching step result in `context.steps` by its
 * `_dataType` and forwards `result.data` to the wrapped widget. This lets
 * `render-view` and the single-widget `*_show_*` tools (via
 * `buildSingleWidgetView`) share the same widget components without
 * touching their props.
 */
export function adaptDataWidget<T>(
  Widget: ComponentType<{ data: T | null }>,
  dataType: string,
): WidgetComponent {
  function AdaptedWidget({ context }: WidgetProps) {
    const stepResult = Object.values(context.steps).find((s) => s._dataType === dataType)
    const data = (stepResult?.data ?? null) as T | null
    return <Widget data={data} />
  }
  AdaptedWidget.displayName = `Adapted(${Widget.displayName ?? Widget.name ?? "Widget"})`
  return AdaptedWidget
}
