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

const tierColor: Record<string, string> = {
  gold: "#b45309",
  silver: "#475569",
  bronze: "#a16207",
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

  return (
    <div
      style={{
        padding: "1rem",
        border: "1px solid #0ea5e9",
        borderRadius: 8,
        background: "#f0f9ff",
      }}
    >
      <div style={{ fontSize: "0.75em", color: "#0369a1", marginBottom: 6 }}>
        remote bundle • customers-upstream
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <h3 style={{ margin: "0 0 4px", color: "#0f172a" }}>{name}</h3>
        <span
          style={{
            fontSize: "0.7em",
            padding: "2px 8px",
            borderRadius: 999,
            border: `1px solid ${tierColor[tier] ?? "#475569"}`,
            color: tierColor[tier] ?? "#475569",
            textTransform: "uppercase",
            letterSpacing: "0.05em",
          }}
        >
          {tier}
        </span>
      </div>
      <div style={{ fontSize: "0.85em", color: "#334155" }}>{email}</div>
      <div style={{ fontSize: "0.75em", color: "#64748b", marginTop: 4 }}>
        customer since {since || "—"}
      </div>
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        style={{
          marginTop: 10,
          padding: "4px 10px",
          border: "1px solid #0ea5e9",
          borderRadius: 4,
          background: "white",
          color: "#0369a1",
          cursor: "pointer",
          fontSize: "0.8em",
        }}
      >
        {expanded ? "hide id" : "show id"}
      </button>
      {expanded && (
        <div style={{ fontSize: "0.75em", color: "#64748b", marginTop: 6 }}>
          id: {str(customer.id) || "—"}
        </div>
      )}
    </div>
  )
}
