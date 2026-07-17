import { useState } from "react"
import { parseToolResult, useCallTool } from "@miragon/mcp-toolkit-ui"

/**
 * Remote-hosted widget served as an MCP resource by `customers-upstream`.
 *
 * The host never sees this source — the bundle is fetched at render time
 * through `read-widget-bundle`, evaluated via a Blob URL + dynamic `import()`,
 * and mounted by `McpAppView` next to host-bundled widgets.
 *
 * All bare imports are external (see `vite.config.ts`): they resolve through
 * the host page's `<script type="importmap">` shims
 * (`buildSharedRuntimeImportMap`), which re-export the namespaces the host's
 * `exposeSharedRuntime` call put on globalThis — the SAME module instances as
 * the host. That instance identity is what makes `useCallTool` work here:
 * the hook reads the host's React context, so this remote widget can call
 * federated tools (`customers_get-customer`) interactively. The manifest
 * declares the dependency via `runtime.toolkitUi`.
 */

interface Customer {
  id?: unknown
  name?: unknown
  email?: unknown
  tier?: unknown
  since?: unknown
}

interface Keys {
  "customers:customer"?: unknown
}

const tierBronze = { border: "#a16207", text: "#854d0e", bg: "#fefce8" }
const tierColor: Record<string, { border: string; text: string; bg: string }> = {
  gold: { border: "#b45309", text: "#92400e", bg: "#fffbeb" },
  silver: { border: "#475569", text: "#334155", bg: "#f1f5f9" },
  bronze: tierBronze,
}

function str(value: unknown): string {
  return typeof value === "string" ? value : ""
}

export default function CustomerCard({ keys }: { keys: Keys }) {
  // The pipeline-resolved customer is the initial render; a refresh replaces
  // it with a live re-fetch through the host's federated tool.
  const [refreshed, setRefreshed] = useState<Customer | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [refreshError, setRefreshError] = useState<string | null>(null)
  const callTool = useCallTool()

  const customer = refreshed ?? keys["customers:customer"] ?? {}
  const name = str(customer.name) || "(unknown)"
  const email = str(customer.email)
  const tier = str(customer.tier) || "bronze"
  const since = str(customer.since)
  const [expanded, setExpanded] = useState(false)
  const tierStyle = tierColor[tier] ?? tierBronze

  const refresh = async () => {
    const id = str(customer.id)
    if (!callTool || !id || refreshing) return
    setRefreshing(true)
    setRefreshError(null)
    try {
      // Federated tool on the host: `<proxy>_<tool>` — routed back to this
      // widget's own upstream server.
      const result = await callTool("customers_get-customer", { id })
      setRefreshed(parseToolResult(result))
    } catch (err) {
      setRefreshError(err instanceof Error ? err.message : String(err))
    } finally {
      setRefreshing(false)
    }
  }

  return (
    <div
      style={{
        padding: "1rem 1.25rem",
        borderRadius: 12,
        background: "#ffffff",
        color: "#0f172a",
        boxShadow: "0 1px 3px rgba(15, 23, 42, 0.08), 0 0 0 1px rgba(15, 23, 42, 0.06)",
        fontFamily:
          "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
      }}
    >
      <div
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          fontSize: 11,
          fontWeight: 500,
          color: "#0369a1",
          background: "#e0f2fe",
          padding: "2px 8px",
          borderRadius: 999,
          marginBottom: 10,
          letterSpacing: "0.02em",
        }}
      >
        <span
          style={{
            display: "inline-block",
            width: 6,
            height: 6,
            borderRadius: 999,
            background: "#0ea5e9",
          }}
        />
        remote bundle · customers-upstream
      </div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: 12,
        }}
      >
        <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600, color: "#0f172a" }}>{name}</h3>
        <span
          style={{
            fontSize: 10,
            fontWeight: 600,
            padding: "3px 9px",
            borderRadius: 999,
            border: `1px solid ${tierStyle.border}`,
            color: tierStyle.text,
            background: tierStyle.bg,
            textTransform: "uppercase",
            letterSpacing: "0.08em",
            whiteSpace: "nowrap",
          }}
        >
          {tier}
        </span>
      </div>
      <div style={{ fontSize: 13, color: "#334155", marginTop: 6 }}>{email}</div>
      <div style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>
        customer since {since || "—"}
      </div>
      <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          style={{
            padding: "5px 12px",
            border: "1px solid #e2e8f0",
            borderRadius: 6,
            background: "#f8fafc",
            color: "#334155",
            cursor: "pointer",
            fontSize: 12,
            fontWeight: 500,
            transition: "background 0.15s",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = "#f1f5f9")}
          onMouseLeave={(e) => (e.currentTarget.style.background = "#f8fafc")}
        >
          {expanded ? "hide id" : "show id"}
        </button>
        <button
          type="button"
          onClick={() => void refresh()}
          disabled={!callTool || refreshing}
          style={{
            padding: "5px 12px",
            border: "1px solid #bae6fd",
            borderRadius: 6,
            background: "#e0f2fe",
            color: "#0369a1",
            cursor: refreshing ? "wait" : "pointer",
            fontSize: 12,
            fontWeight: 500,
          }}
        >
          {refreshing ? "refreshing…" : refreshed ? "refreshed ✓ — again" : "refresh via tool"}
        </button>
      </div>
      {refreshError && (
        <div style={{ fontSize: 12, color: "#b91c1c", marginTop: 8 }}>{refreshError}</div>
      )}
      {expanded && (
        <div
          style={{
            fontSize: 12,
            color: "#64748b",
            marginTop: 8,
            padding: "6px 8px",
            background: "#f8fafc",
            borderRadius: 4,
            fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
          }}
        >
          id: {str(customer.id) || "—"}
        </div>
      )}
    </div>
  )
}
