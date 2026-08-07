import { useEffect, type ComponentType, type ReactNode } from "react"
import { ModelContext } from "mcp-use/react"
import type { WidgetProps } from "@miragon/mcp-toolkit-core"
import { useHostBridgeOrNull } from "./host-bridge.js"
import { useIsInsideMcpUseView } from "./mcp-use-host-bridge.js"
import type { WidgetComponent } from "./widget-renderer.js"

/**
 * Builds the model-context line for an adapted widget. Receives the resolved
 * step data (never null — the adapter skips the description while loading) plus
 * the per-cell layout props so scope filters that only travel as props (e.g.
 * `period` / `engine` on dashboard widgets) can be reported too.
 */
export type DescribeForModel<T> = (
  data: NonNullable<T>,
  props: Readonly<Record<string, unknown>>,
) => string

/**
 * Model-context reporting that works on every host. mcp-use 2.x's
 * `ModelContext` registers with the view runtime and THROWS outside a
 * `bootstrapView` mount, so it is only rendered inside an mcp-use view (where
 * it aggregates nested nodes into one tree). Everywhere else — ChatGPT via
 * `createChatGptHostBridge`, the `WidgetFixtureHost` harness, standalone apps —
 * the description flows through the bridge's `setModelContext` instead
 * (last-writer-wins; fine for the single-widget mounts those hosts render).
 */
function SafeModelContext({ content, children }: { content: string; children: ReactNode }) {
  const insideView = useIsInsideMcpUseView()
  if (insideView) return <ModelContext content={content}>{children}</ModelContext>
  return <BridgeModelContext content={content}>{children}</BridgeModelContext>
}

function BridgeModelContext({ content, children }: { content: string; children: ReactNode }) {
  const bridge = useHostBridgeOrNull()
  const setModelContext = bridge?.setModelContext
  useEffect(() => {
    setModelContext?.(content)
  }, [setModelContext, content])
  return children
}

/**
 * Wraps a "single-data" widget component (signature `({ data }: { data: T | null })`)
 * so it can be registered as a framework {@link WidgetComponent} (which receives
 * `WidgetProps = { keys, context, widgetProps? }`). The adapter looks up the
 * matching step result in `context.steps` by its `_dataType` and forwards
 * `result.data` to the wrapped widget. Lets `render-view` and `*_show_*` tools
 * (via `buildSingleWidgetView`) share the same widget components without
 * changing their props.
 *
 * Per-cell `props` from the layout (`row[].props`) are spread onto the
 * wrapped widget as named props. This lets the same widget appear multiple
 * times in one view with different scoping (e.g. one tab per process key).
 *
 * When `describeForModel` is provided the adapter wraps the widget in a
 * `SafeModelContext` so the model knows what the user is looking at (view
 * identity, active filters, headline numbers) without per-widget boilerplate.
 * The description is only rendered once the step data is present; widgets that
 * self-fetch when the adapter has no data (cockpit views) must render their own
 * `<ModelContext>` instead.
 */
export function adaptDataWidget<T>(
  Widget: ComponentType<{ data: T | null } & Record<string, unknown>>,
  dataType: string,
  describeForModel?: DescribeForModel<T>,
): WidgetComponent {
  function AdaptedWidget({ context, widgetProps }: WidgetProps) {
    const stepResult = Object.values(context.steps).find((s) => s._dataType === dataType)
    const data = (stepResult?.data ?? null) as T | null
    const widget = <Widget {...(widgetProps ?? {})} data={data} />
    if (data == null || !describeForModel) return widget
    return (
      <SafeModelContext content={describeForModel(data, widgetProps ?? {})}>
        {widget}
      </SafeModelContext>
    )
  }
  AdaptedWidget.displayName = `Adapted(${Widget.displayName ?? Widget.name ?? "Widget"})`
  return AdaptedWidget
}
