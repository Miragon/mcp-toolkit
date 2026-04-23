import {
  GET_MODULE_MANIFEST_TOOL,
  ModuleManifestSchema,
  type ModuleManifest,
  type ProxyConfigEntry,
} from "@miragon/mcp-toolkit-proxy-contract"
import type { UpstreamProxyPlugin } from "../proxy/UpstreamProxyPlugin.js"

/**
 * Default major React version the host targets when no explicit override
 * is passed to {@link discoverUpstreamModules}. Kept in lockstep with the
 * `TOOLKIT_REACT_MAJOR` constant in `@miragon/mcp-toolkit-ui` — bump both
 * together when the UI peer's React major changes.
 *
 * Duplicated here rather than imported from `@miragon/mcp-toolkit-ui`
 * because the UI package depends on core; importing the other direction
 * would create a cycle.
 */
export const DEFAULT_HOST_REACT_MAJOR = 19 as const

/**
 * A manifest successfully fetched + validated from a proxy. Carries the
 * originating proxy so downstream synthesis can wire `proxyBinding` and
 * the per-module `callTool` closure without another lookup.
 */
export interface DiscoveredModule {
  manifest: ModuleManifest
  proxy: UpstreamProxyPlugin
}

export interface DiscoverUpstreamModulesOptions {
  entries: ProxyConfigEntry[]
  proxies: UpstreamProxyPlugin[]
  /**
   * Major React version the host ships. Manifests whose `runtime.react`
   * range excludes this major are skipped (fail-soft). Defaults to the
   * toolkit's own `TOOLKIT_REACT_MAJOR` for hosts that don't pass one.
   */
  hostReactMajor: number
}

/**
 * Shape of an MCP tool response we care about. mcp-use's `callTool`
 * returns the raw JSON-RPC result; for `get-module-manifest` we accept
 * either `structuredContent` (preferred) or a single text block carrying
 * the manifest as JSON. Other shapes are treated as protocol errors.
 */
interface ToolResponse {
  content?: Array<{ type: string; text?: string }>
  structuredContent?: unknown
  isError?: boolean
}

/**
 * Discovers module manifests from every proxy flagged with
 * `upstreamModules: true`. Skips entries that aren't flagged, entries with
 * no matching registered proxy, and entries whose manifest fails
 * validation or React-major check — each failure logs a warning but does
 * not abort discovery, so one broken upstream cannot brick the host.
 */
export async function discoverUpstreamModules(
  options: DiscoverUpstreamModulesOptions,
): Promise<DiscoveredModule[]> {
  const flagged = options.entries.filter((e) => e.upstreamModules === true)
  if (flagged.length === 0) return []

  const byName = new Map(options.proxies.map((p) => [p.name, p]))
  const results: DiscoveredModule[] = []

  for (const entry of flagged) {
    const proxy = byName.get(entry.name)
    if (!proxy) {
      console.warn(
        `[mcp-toolkit] proxy "${entry.name}" has upstreamModules: true but no matching UpstreamProxyPlugin was registered — skipping discovery.`,
      )
      continue
    }

    let raw: unknown
    try {
      raw = await proxy.callUpstream(GET_MODULE_MANIFEST_TOOL, {})
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      console.warn(
        `[mcp-toolkit] module discovery failed for "${entry.name}": ${message} — skipping.`,
      )
      continue
    }

    const payload = extractManifestPayload(raw)
    if (payload === undefined) {
      console.warn(
        `[mcp-toolkit] module discovery for "${entry.name}" returned no manifest payload — skipping.`,
      )
      continue
    }

    const parsed = ModuleManifestSchema.safeParse(payload)
    if (!parsed.success) {
      console.warn(
        `[mcp-toolkit] invalid module manifest from "${entry.name}": ${parsed.error.issues
          .map((i) => `${i.path.join(".")}: ${i.message}`)
          .join("; ")} — skipping.`,
      )
      continue
    }

    if (!reactMajorSatisfied(parsed.data.runtime.react, options.hostReactMajor)) {
      console.warn(
        `[mcp-toolkit] module "${parsed.data.moduleId}" from "${entry.name}" requires React "${parsed.data.runtime.react}", host ships React ${options.hostReactMajor} — skipping.`,
      )
      continue
    }

    results.push({ manifest: parsed.data, proxy })
  }

  return results
}

/**
 * Accepts the two canonical MCP tool return shapes we care about for
 * manifest discovery: a `structuredContent` object (preferred), or a
 * single text content block containing manifest JSON. Returns undefined
 * otherwise so the caller can fail-soft.
 */
function extractManifestPayload(raw: unknown): unknown {
  if (!raw || typeof raw !== "object") return undefined
  const response = raw as ToolResponse
  if (response.isError) return undefined
  if (response.structuredContent !== undefined) return response.structuredContent
  const first = response.content?.find((c) => c.type === "text" && typeof c.text === "string")
  if (!first?.text) return undefined
  try {
    return JSON.parse(first.text) as unknown
  } catch {
    return undefined
  }
}

/**
 * Minimal semver-range gate: true iff `range` admits the given major. We
 * accept the three forms that cover ~100% of realistic manifests:
 *
 * - Plain major: `"19"` or `"19.0.0"`
 * - Caret: `"^19.0.0"` — any version with the same major
 * - Tilde: `"~19.0.0"` — same major (tighter semantics aren't necessary
 *   because we only check the major anyway)
 *
 * More exotic ranges (`">=19 <20"`, multiple clauses) are rejected
 * rather than guessed — upstreams that need them can pin to a simpler
 * form.
 */
function reactMajorSatisfied(range: string, hostMajor: number): boolean {
  const trimmed = range.trim()
  const withoutPrefix = trimmed.replace(/^[\^~]/, "")
  const majorToken = withoutPrefix.split(".")[0]
  if (!majorToken) return false
  const parsed = Number.parseInt(majorToken, 10)
  if (!Number.isFinite(parsed)) return false
  return parsed === hostMajor
}
