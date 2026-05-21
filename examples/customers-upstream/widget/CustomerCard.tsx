import { useState } from "react"

/**
 * Remote-hosted widget served as an MCP resource by `customers-upstream`.
 *
 * The host never sees this source — the bundle is fetched at render time
 * through `read-widget-bundle`, evaluated via a Blob URL + dynamic `import()`,
 * and mounted by `McpAppView` next to host-bundled widgets.
 *
 * `react` and `react/jsx-runtime` are external: they resolve through the
 * host's `<script type="importmap">` (see `examples/app-bundle/index.html`),
 * which re-exports `globalThis.React` — same instance as the host, so hooks
 * and context work identically.
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
  const customer = (keys["customers:customer"] ?? {}) as Customer
  const name = str(customer.name) || "(unknown)"
  const email = str(customer.email)
  const tier = str(customer.tier) || "bronze"
  const since = str(customer.since)
  const [expanded, setExpanded] = useState(false)
  const tierStyle = tierColor[tier] ?? tierBronze

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
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        style={{
          marginTop: 12,
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
