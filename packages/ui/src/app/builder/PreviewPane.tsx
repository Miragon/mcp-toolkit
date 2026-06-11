import { memo } from "react"
import type { RowDef, WidgetProps } from "@miragon/mcp-toolkit-core"
import { GridItem, GridLayout } from "../../components/GridLayout.js"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../primitives/tabs.js"
import { RenderedWidget, type WidgetComponent } from "../widget-renderer.js"
import type { DraftLayout } from "./builder-model.js"

// -------------------------------------------------------------------------- //
// Preview pane
// -------------------------------------------------------------------------- //

function PreviewPaneImpl({
  draft,
  activeTabIndex,
  setActiveTabIndex,
  widgets,
  widgetProps,
}: {
  draft: DraftLayout
  activeTabIndex: number
  setActiveTabIndex: (idx: number) => void
  widgets: Record<string, WidgetComponent>
  widgetProps: WidgetProps
}) {
  const renderRows = (rs: RowDef[]) => (
    <div className="flex flex-col gap-4">
      {rs.map((row, rowIdx) => (
        <GridLayout key={rowIdx}>
          {row.row.map((cell, cellIdx) => (
            <GridItem key={`${cell.widget}-${cellIdx}`} span={cell.span ?? 12}>
              <RenderedWidget
                widget={widgets[cell.widget]}
                widgetId={cell.widget}
                props={widgetProps}
                cellProps={cell.props}
                showEmptyHint
              />
            </GridItem>
          ))}
        </GridLayout>
      ))}
    </div>
  )

  if (draft.kind === "tabs") {
    return (
      <Tabs
        value={draft.tabs[activeTabIndex]?.label ?? ""}
        onValueChange={(label) => {
          const idx = draft.tabs.findIndex((t) => t.label === label)
          if (idx >= 0) setActiveTabIndex(idx)
        }}
      >
        <TabsList>
          {draft.tabs.map((tab) => (
            <TabsTrigger key={tab.label} value={tab.label}>
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>
        {draft.tabs.map((tab) => (
          <TabsContent key={tab.label} value={tab.label} className="mt-3">
            {renderRows(tab.rows)}
          </TabsContent>
        ))}
      </Tabs>
    )
  }
  return renderRows(draft.rows)
}

export const PreviewPane = memo(PreviewPaneImpl)
