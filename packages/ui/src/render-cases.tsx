import type { ReactElement } from "react"
import {
  Button,
  CountPill,
  DrillButton,
  FilterBar,
  GridItem,
  GridLayout,
  GroupCard,
  KpiGrid,
  ListFooter,
  LivePill,
  LocaleProvider,
  SectionHeading,
  ThemeProvider,
  themePresets,
  useLocale,
  WidgetHeader,
} from "./index.js"
import { createStandaloneHostBridge, HostBridgeProvider, useHostBridge } from "./app/host-bridge.js"
import { HostModelContext } from "./app/adapt-data-widget.js"
import { WidgetFixtureHost, type FixtureWidget } from "./app/widget-fixture.js"
import { PRIMITIVE_RENDER_CASES, type RenderCase } from "./render-cases-primitives.js"

export type { RenderCase } from "./render-cases-primitives.js"

/**
 * SSR render cases for every catalogued component/composite (FITNESS.md phase
 * 5c). DATA module, not a test: `render-smoke.test.tsx` renders each case via
 * `react-dom/server`'s `renderToStaticMarkup` (jsdom is deliberately renounced
 * — SSR is the house render path) and enforces completeness against
 * `ui-catalog.json` ∪ `ratchets/render-allowlist.json` (shrink-only).
 *
 * Each case mounts the component with minimal realistic props and, where the
 * markup can carry one, a distinctive `marker` string the test asserts on.
 * The primitive cases live in `render-cases-primitives.tsx` (file-length
 * budget); this module aggregates them with the composed/host cases.
 */

const noop = (): void => {}

/** Static bridge for the host-bridge cases — theme "dark" is the probed marker. */
const probeBridge = createStandaloneHostBridge({
  callTool: () => Promise.resolve({}),
  theme: "dark",
})

/** Proves HostBridgeProvider actually provides: reads the bridge from context. */
function BridgeThemeProbe(): ReactElement {
  const bridge = useHostBridge()
  return <span>RC:HostBridgeProvider {bridge.theme ?? "unset"}</span>
}

/** Proves LocaleProvider actually provides: reads the locale from context. */
function LocaleProbe(): ReactElement {
  const locale = useLocale()
  return <span>RC:LocaleProvider {locale}</span>
}

/** Minimal raw `({ data })` widget for the WidgetFixtureHost case. */
function FixtureProbeWidget({ data }: { data?: { label?: string } | null }): ReactElement {
  return <div>RC:WidgetFixtureHost {data?.label ?? "no fixture"}</div>
}

export const RENDER_CASES: RenderCase[] = [
  ...PRIMITIVE_RENDER_CASES,

  // ── Composed components ──
  {
    name: "GridLayout",
    marker: "RC:GridLayout",
    render: () => (
      <GridLayout>
        <GridItem span={8}>
          <div>RC:GridLayout</div>
        </GridItem>
        <GridItem span={4}>
          <div>side tile</div>
        </GridItem>
      </GridLayout>
    ),
  },
  {
    name: "GridItem",
    marker: "RC:GridItem",
    render: () => (
      <GridLayout>
        <GridItem span={6}>
          <div>RC:GridItem</div>
        </GridItem>
      </GridLayout>
    ),
  },
  {
    name: "KpiGrid",
    marker: "RC:KpiGrid",
    render: () => (
      <KpiGrid
        boxed
        header={{ label: "RC:KpiGrid", badge: "live" }}
        cells={[
          {
            label: "Open",
            value: 7,
            tone: "danger",
            trend: "+2 vs yesterday",
            trendDirection: "up",
          },
          { label: "Done", value: 12, fraction: "/19", tone: "success" },
          { label: "Total", value: 19, onClick: noop, ariaLabel: "Show all" },
        ]}
      />
    ),
  },
  {
    name: "LivePill",
    marker: "RC:LivePill",
    render: () => <LivePill tone="success">RC:LivePill</LivePill>,
  },
  {
    name: "CountPill",
    marker: "RC:CountPill",
    render: () => <CountPill tone="warning">RC:CountPill</CountPill>,
  },
  {
    name: "SectionHeading",
    marker: "RC:SectionHeading",
    render: () => <SectionHeading title="RC:SectionHeading" hint="3 shown" />,
  },
  {
    name: "WidgetHeader",
    marker: "RC:WidgetHeader",
    render: () => (
      <WidgetHeader
        icon="✓"
        iconTone="info"
        title="RC:WidgetHeader"
        sub={<LivePill>Live</LivePill>}
        actions={
          <Button size="sm" variant="ghost" onClick={noop}>
            Refresh
          </Button>
        }
      />
    ),
  },
  {
    name: "GroupCard",
    marker: "RC:GroupCard",
    render: () => (
      <GroupCard expanded onToggle={noop} summary={<div>RC:GroupCard</div>}>
        <div>Expanded body row</div>
      </GroupCard>
    ),
  },
  {
    // The search marker lands in the input's value attribute.
    name: "FilterBar",
    marker: "RC:FilterBar",
    render: () => (
      <FilterBar
        search="RC:FilterBar"
        searchPlaceholder="Filter tasks…"
        onSearchChange={noop}
        chips={[
          { id: "high", label: "high", count: 2, active: true },
          { id: "low", label: "low" },
        ]}
        onChipToggle={noop}
      />
    ),
  },
  {
    name: "DrillButton",
    marker: "RC:DrillButton",
    render: () => (
      <DrillButton onDrill={noop} icon="↗" size="sm" ariaLabel="Open order o-1001">
        RC:DrillButton
      </DrillButton>
    ),
  },
  {
    name: "ListFooter",
    marker: "of 42 tasks",
    render: () => <ListFooter shown={8} total={42} hasMore onLoadMore={noop} noun="tasks" />,
  },

  // ── Host seam / providers ──
  {
    name: "HostBridgeProvider",
    marker: "RC:HostBridgeProvider dark",
    render: () => (
      <HostBridgeProvider bridge={probeBridge}>
        <BridgeThemeProbe />
      </HostBridgeProvider>
    ),
  },
  {
    // Outside an mcp-use view HostModelContext reports through the bridge in
    // an effect (a no-op in SSR) and must still render its children.
    name: "HostModelContext",
    marker: "RC:HostModelContext",
    render: () => (
      <HostBridgeProvider bridge={probeBridge}>
        <HostModelContext content="Viewing 3 open incidents">
          <div>RC:HostModelContext</div>
        </HostModelContext>
      </HostBridgeProvider>
    ),
  },
  {
    name: "ThemeProvider",
    marker: "RC:ThemeProvider",
    render: () => (
      <ThemeProvider theme={themePresets.miragon} mode="dark">
        <div>RC:ThemeProvider</div>
      </ThemeProvider>
    ),
  },
  {
    name: "LocaleProvider",
    marker: "RC:LocaleProvider de",
    render: () => (
      <LocaleProvider locale="de">
        <LocaleProbe />
      </LocaleProvider>
    ),
  },
  {
    name: "WidgetFixtureHost",
    marker: "RC:WidgetFixtureHost fixture-data",
    render: () => (
      <WidgetFixtureHost
        widget={FixtureProbeWidget as FixtureWidget}
        data={{ label: "fixture-data" }}
      />
    ),
  },
]
