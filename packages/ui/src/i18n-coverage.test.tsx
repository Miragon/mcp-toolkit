import { isValidElement, type ReactElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"
import type { WidgetProps } from "@miragon/mcp-toolkit-core"
import { EmptyState } from "./components/EmptyState.js"
import { ErrorState } from "./components/ErrorState.js"
import { ToastViewport } from "./components/Toast.js"
import { LocaleProvider } from "./locale/locale-provider.js"
import { TOOLKIT_MESSAGES, type ToolkitMessages } from "./locale/toolkit-messages.js"
import { createToast } from "./lib/toast-model.js"
import { RENDER_CASES } from "./render-cases.js"
import { userFacingTexts } from "./render-scan.js"
import { StepErrors, ViewToolbar, type ViewData } from "./app/mcp-app-view-chrome.js"
import { ViewPlaceholder } from "./app/mcp-app-view-states.js"
import { LayoutBuilder } from "./app/layout-builder.js"
import { BuilderBanners } from "./app/builder/BuilderBanners.js"
import { PipelineStrip } from "./app/builder/PipelineStrip.js"
import { StatusChip } from "./app/builder/status-chip.js"
import { Toolbar } from "./app/builder/Toolbar.js"
import { Workspace } from "./app/builder/Workspace.js"
import { WidgetCrashFallback, WidgetRenderer } from "./app/widget-renderer.js"

/**
 * Render half of the i18n guard (the static half is `no-hardcoded-copy.test.ts`):
 * render every component under the German locale with a MARKED catalog —
 * each catalog string wrapped in ⟦…⟧ — and scan every text node and text
 * attribute. Whatever is neither marked (it came from the catalog) nor a
 * fixture value the case passed in (it came from props) is a hard-coded
 * string that a German user would read in English.
 */

const OPEN = "⟦"
const CLOSE = "⟧"

function marked(messages: ToolkitMessages): ToolkitMessages {
  const mark = (value: unknown): unknown =>
    typeof value === "function"
      ? (...args: unknown[]) => `${OPEN}${(value as (...a: unknown[]) => string)(...args)}${CLOSE}`
      : `${OPEN}${String(value)}${CLOSE}`
  return Object.fromEntries(
    Object.entries(messages).map(([section, entries]) => [
      section,
      Object.fromEntries(
        Object.entries(entries as Record<string, unknown>).map(([k, v]) => [k, mark(v)]),
      ),
    ]),
  ) as unknown as ToolkitMessages
}

const PSEUDO = marked(TOOLKIT_MESSAGES.de)

/** Every string/number a case hands to the tree through props (its fixtures). */
function fixtureStrings(node: unknown, out = new Set<string>(), seen = new Set<unknown>()) {
  if (typeof node === "string" || typeof node === "number") {
    const text = String(node).trim()
    if (text.length >= 2) out.add(text)
    return out
  }
  if (!node || typeof node !== "object" || seen.has(node)) return out
  seen.add(node)
  if (node instanceof Error) return fixtureStrings(node.message, out, seen)
  if (isValidElement(node)) return fixtureStrings(node.props, out, seen)
  for (const value of Array.isArray(node) ? node : Object.values(node)) {
    fixtureStrings(value, out, seen)
  }
  return out
}

/** Text a German user would read that came neither from the catalog nor from props. */
function leaks(element: ReactElement): string[] {
  const html = renderToStaticMarkup(
    <LocaleProvider locale="de" toolkitMessages={PSEUDO}>
      {element}
    </LocaleProvider>,
  )
  const fixtures = [...fixtureStrings(element)].sort((a, b) => b.length - a.length)
  const found: string[] = []
  for (const { source, value } of userFacingTexts(html)) {
    let rest = value
    const innermost = /⟦[^⟦⟧]*⟧/g
    while (innermost.test(rest)) rest = rest.replace(innermost, " ")
    rest = rest.replace(/RC:[\w:-]+/g, " ")
    for (const fixture of fixtures) rest = rest.split(fixture).join(" ")
    if (/\p{L}/u.test(rest)) found.push(`${source}: "${value}" → "${rest.trim()}"`)
  }
  return found
}

const noop = (): void => {}
const asyncNoop = (): Promise<void> => Promise.resolve()

const view: ViewData = {
  title: "Prozessdefinitionen",
  context: { keys: {}, stepIds: [], stepData: {}, errors: [] },
  layout: { rows: [] },
  _refreshParams: { layout: { rows: [] } },
}

function Crash(): never {
  throw new Error("kaputt")
}

function Fine({ keys }: WidgetProps) {
  return <span>{typeof keys.label === "string" ? keys.label : ""}</span>
}

/** The toolkit chrome no catalogued render case reaches. */
const CHROME_CASES: { name: string; render: () => ReactElement }[] = [
  {
    name: "ViewPlaceholder waiting + slow hint",
    render: () => (
      <ViewPlaceholder
        lifecycle={{ phase: "waiting", slow: true }}
        labels={PSEUDO.view}
        onRetry={noop}
      />
    ),
  },
  {
    name: "ViewPlaceholder error",
    render: () => (
      <ViewPlaceholder
        lifecycle={{ phase: "error", reason: "[503] engine down", canRetry: true }}
        labels={PSEUDO.view}
        onRetry={noop}
      />
    ),
  },
  {
    name: "ViewPlaceholder error without a retry",
    render: () => (
      <ViewPlaceholder
        lifecycle={{ phase: "error", reason: undefined, canRetry: false }}
        labels={PSEUDO.view}
        onRetry={noop}
      />
    ),
  },
  {
    name: "StepErrors without a refresh",
    render: () => (
      <StepErrors
        hidden={false}
        errors={[{ stepId: "inc", reason: "[503] engine down" }]}
        labels={PSEUDO.view}
      />
    ),
  },
  {
    name: "ViewPlaceholder cancelled",
    render: () => (
      <ViewPlaceholder lifecycle={{ phase: "cancelled" }} labels={PSEUDO.view} onRetry={noop} />
    ),
  },
  {
    name: "ViewToolbar",
    render: () => (
      <ViewToolbar
        hidden={false}
        viewData={view}
        builderAvailable
        isFullscreen={false}
        canFullscreen
        isRefreshing={false}
        labels={PSEUDO.view}
        titleMode="show"
        titleLevel={2}
        onRefresh={asyncNoop}
        onEnterBuildMode={noop}
        onToggleFullscreen={asyncNoop}
      />
    ),
  },
  {
    name: "StepErrors",
    render: () => (
      <StepErrors
        hidden={false}
        errors={[{ stepId: "inc", reason: "[503] engine down" }]}
        steps={[{ id: "inc", step: "camunda7:incidents" }]}
        labels={PSEUDO.view}
        onRetry={noop}
      />
    ),
  },
  {
    name: "WidgetRenderer: unknown widget + crashing widget",
    render: () => (
      <WidgetRenderer
        layout={{ rows: [{ row: [{ widget: "demo:gone" }, { widget: "demo:fine" }] }] }}
        keys={{ label: "Rechnung 42" }}
        errors={[]}
        widgets={{ "demo:fine": Fine }}
      />
    ),
  },
  {
    name: "WidgetCrashFallback",
    render: () => (
      <WidgetCrashFallback widgetId="demo:crash" error={new Error("kaputt")} onRetry={noop} />
    ),
  },
  {
    name: "ToastViewport",
    render: () => (
      <ToastViewport
        toasts={[createToast(1, { tone: "success", title: "Job neu eingeplant." })]}
        onDismiss={noop}
      />
    ),
  },
  {
    name: "ErrorState defaults",
    render: () => <ErrorState title="Fehler" details="raw" onRetry={noop} />,
  },
  {
    name: "EmptyState",
    render: () => <EmptyState title="Leer" description="Nichts zu tun." />,
  },
  {
    name: "LayoutBuilder (empty: data-sources hint)",
    render: () => <LayoutBuilder widgets={{}} callTool={() => Promise.resolve({})} />,
  },
  {
    name: "LayoutBuilder (tabs, cells, unknown widget)",
    render: () => (
      <LayoutBuilder
        initialLayout={{
          tabs: [
            { label: "Übersicht", rows: [{ row: [{ widget: "demo:gone" }] }, { row: [] }] },
            { label: "Details-Tab", rows: [] },
          ],
        }}
        widgets={{ "demo:fine": Crash }}
        callTool={() => Promise.resolve({})}
      />
    ),
  },
  {
    name: "Builder toolbar (advanced, unsaved)",
    render: () => (
      <Toolbar
        L={PSEUDO.builder}
        previewMode={false}
        isBusy={false}
        status="pending"
        liveKeys={2}
        reachableCount={5}
        unreachableCount={1}
        advanced
        onToggleAdvanced={noop}
        unsaved
        onOpenCatalogue={noop}
        onOpenSave={noop}
        onDiscard={noop}
        onApply={noop}
        hasAnyCell
      />
    ),
  },
  {
    name: "Builder workspace (titled and untitled palette entries, canvas cells)",
    render: () => (
      <Workspace
        L={PSEUDO.builder}
        paletteByApp={[
          [
            "demo",
            [
              {
                id: "demo:orders",
                app: "demo",
                requires: ["demo:key"],
                size: "full",
                title: { en: "Orders", de: "Bestellungen" },
                summary: { de: "Alle offenen Bestellungen." },
              },
              { id: "demo:raw", app: "demo", requires: [], size: "half" },
            ],
          ],
        ]}
        paletteCount={2}
        activeRows={[{ row: [{ widget: "demo:orders" }] }, { row: [] }]}
        focusedRowIndex={0}
        setFocusedRowIndex={noop}
        dragOverRow={null}
        setDragOverRow={noop}
        onAddRow={noop}
        onRemoveRow={noop}
        onMoveRow={noop}
        onSetCellSpan={noop}
        onRemoveCell={noop}
        onAddWidget={noop}
        onConfigureCell={noop}
        propsSchemaByWidgetId={new Map([["demo:orders", { type: "object" }]])}
        displayByWidgetId={new Map([["demo:orders", { title: { de: "Bestellungen" } }]])}
        advanced
        widgets={{}}
        widgetProps={{ keys: {}, context: { keys: {}, steps: {}, errors: [] } }}
        onAddTab={noop}
      />
    ),
  },
  {
    name: "Builder data sources",
    render: () => (
      <PipelineStrip
        L={PSEUDO.builder}
        keyEntries={[
          { name: "demo:id", rawValue: "42" },
          { name: "demo:live", rawValue: "" },
        ]}
        stepEntries={[{ id: "s1", step: "demo:load" }]}
        keyCatalog={[]}
        availableSteps={[
          { id: "demo:load", app: "demo", dataType: "demo:t", requires: [], produces: [] },
        ]}
        stepsByApp={[]}
        liveKeys={{ "demo:live": 7 }}
        onAddKey={noop}
        onUpdateKey={noop}
        onRemoveKey={noop}
        onAddStep={noop}
        onUpdateStep={noop}
        onRemoveStep={noop}
        status="refreshing"
      />
    ),
  },
  {
    name: "Builder banners + status chips",
    render: () => (
      <div>
        <BuilderBanners
          L={PSEUDO.builder}
          catalogueToolName="get-builder-catalogue"
          refreshError="timeout"
          validationIssues={["demo:id fehlt"]}
        />
        <StatusChip status="idle" L={PSEUDO.builder} />
        <StatusChip status="pending" L={PSEUDO.builder} />
        <StatusChip status="refreshing" L={PSEUDO.builder} />
      </div>
    ),
  },
]

describe("no English leaks into a German view", () => {
  it("the marked catalog marks every string (the scan can see catalog text)", () => {
    expect(PSEUDO.view.loading).toBe(`⟦${TOOLKIT_MESSAGES.de.view.loading}⟧`)
    expect(PSEUDO.builder.saved("x")).toBe(`⟦${TOOLKIT_MESSAGES.de.builder.saved("x")}⟧`)
  })

  for (const renderCase of [...RENDER_CASES, ...CHROME_CASES]) {
    it(`${renderCase.name} renders only catalog text and props under de`, () => {
      expect(leaks(renderCase.render())).toEqual([])
    })
  }

  it("catches a hard-coded string (gate self-test)", () => {
    const Leaky = ({ name }: { name: string }) => (
      <button type="button" aria-label="Close">
        {name} Load more
      </button>
    )
    expect(leaks(<Leaky name="Rechnung" />)).toEqual([
      'text: "Rechnung Load more" → "Load more"',
      'aria-label: "Close" → "Close"',
    ])
  })
})
