import { z } from "zod"
import {
  GET_MODULE_MANIFEST_TOOL,
  MODULE_MANIFEST_SCHEMA_VERSION,
  ModuleManifestSchema,
  type ModuleManifest,
  type ProxyConfigEntry,
  type RuntimeRequirement,
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
 * Version of the toolkit itself. All @miragon/mcp-toolkit-* packages are
 * version-locked by the release train, so this doubles as the version of
 * `@miragon/mcp-toolkit-ui` a host built against this core exposes to
 * remote bundles. Kept current by release-please (generic updater).
 */
export const TOOLKIT_VERSION = "0.8.0" // x-release-please-version

/**
 * A manifest successfully fetched + validated from a proxy. Carries the
 * originating proxy so downstream synthesis can wire `proxyBinding` and
 * the per-module `callTool` closure without another lookup.
 */
export interface DiscoveredModule {
  manifest: ModuleManifest
  proxy: UpstreamProxyPlugin
}

/**
 * Shared runtimes beyond React a host's app-bundle can expose to remote
 * widget bundles (import map + globalThis shims). Each value is the version
 * of the library the host actually ships.
 */
export interface HostRuntimeExtras {
  /** Version of `mcp-use` (its `/react` entry) the host app-bundle exposes to remote bundles. */
  mcpUseReact?: string
  /** Version of `@miragon/mcp-toolkit-ui` exposed to remote bundles (typically TOOLKIT_VERSION). */
  toolkitUi?: string
  /** Version of `@tanstack/react-query` exposed to remote bundles. */
  reactQuery?: string
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
  /**
   * Shared runtimes beyond React that the host's app-bundle actually exposes
   * (import map + globalThis shims). Absent keys mean "not exposed": a module
   * requiring one is skipped (fail-soft). Declare only what the bundle truly
   * exposes — declaring more lets modules load and then fail at import time.
   */
  hostRuntime?: HostRuntimeExtras
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
 * validation, declares a future schema version, or fails the shared-runtime
 * check (React major plus any extras declared via
 * {@link DiscoverUpstreamModulesOptions.hostRuntime}) — each failure logs a
 * warning but does not abort discovery, so one broken upstream cannot brick
 * the host.
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

    // Probe just the schemaVersion BEFORE the full parse: a future manifest
    // version may add new *required* fields, which would otherwise surface as
    // a confusing "invalid manifest" parse error instead of the accurate
    // "declares a newer schemaVersion" skip. Zod strips unknown keys, so the
    // probe works on any future shape.
    const versionProbe = z
      .object({ schemaVersion: z.number().int().min(1).optional().default(1) })
      .safeParse(payload)
    if (versionProbe.success && versionProbe.data.schemaVersion > MODULE_MANIFEST_SCHEMA_VERSION) {
      console.warn(
        `[mcp-toolkit] module manifest from "${entry.name}" declares schemaVersion ${versionProbe.data.schemaVersion}, host understands up to ${MODULE_MANIFEST_SCHEMA_VERSION} — skipping.`,
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

    if (parsed.data.schemaVersion > MODULE_MANIFEST_SCHEMA_VERSION) {
      console.warn(
        `[mcp-toolkit] module "${parsed.data.moduleId}" from "${entry.name}" declares manifest schemaVersion ${parsed.data.schemaVersion}, host understands up to ${MODULE_MANIFEST_SCHEMA_VERSION} — skipping.`,
      )
      continue
    }

    const issue = findRuntimeIssue(parsed.data.runtime, options.hostReactMajor, options.hostRuntime)
    if (issue) {
      console.warn(
        `[mcp-toolkit] module "${parsed.data.moduleId}" from "${entry.name}" ${issue} — skipping.`,
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
 * Minimal semver-range gate. Accepts plain (`"19"`, `"19.1.2"`), caret
 * (`"^19.0.0"`), and tilde (`"~19.0.0"`) forms only — more exotic ranges
 * (`">=19 <20"`, multiple clauses) are rejected rather than guessed, same
 * policy as before; upstreams that need them can pin to a simpler form.
 *
 * Majors >= 1 compare majors only (identical to the old React-only
 * behavior); major 0 additionally compares minors, because 0.x treats the
 * minor as the breaking axis (the toolkit itself is 0.x).
 */
export function runtimeRangeSatisfied(range: string, hostVersion: string): boolean {
  const want = parseMajorMinor(range)
  const have = parseMajorMinor(hostVersion)
  if (!want || !have) return false
  if (want.major !== have.major) return false
  if (want.major === 0) return want.minor !== undefined && want.minor === have.minor
  return true
}

function parseMajorMinor(v: string): { major: number; minor?: number } | undefined {
  const [majorToken, minorToken] = v
    .trim()
    .replace(/^[\^~]/, "")
    .split(".")
  const major = Number.parseInt(majorToken ?? "", 10)
  if (!Number.isFinite(major)) return undefined
  const minor = minorToken === undefined ? undefined : Number.parseInt(minorToken, 10)
  return { major, minor: Number.isFinite(minor) ? minor : undefined }
}

const RUNTIME_EXTRA_KEYS = [
  ["mcpUseReact", "mcp-use/react"],
  ["toolkitUi", "@miragon/mcp-toolkit-ui"],
  ["reactQuery", "@tanstack/react-query"],
] as const

/**
 * Returns a human-readable reason the host cannot satisfy `required`, or
 * undefined when it can. Covers the React major (always required) plus the
 * optional shared-runtime extras: an extra the module requires but the host
 * does not declare in `hostRuntime` is a failure — declaring nothing means
 * exposing nothing.
 */
export function findRuntimeIssue(
  required: RuntimeRequirement,
  hostReactMajor: number,
  hostRuntime: HostRuntimeExtras = {},
): string | undefined {
  if (!runtimeRangeSatisfied(required.react, String(hostReactMajor))) {
    return `requires React "${required.react}", host ships React ${hostReactMajor}`
  }
  for (const [key, label] of RUNTIME_EXTRA_KEYS) {
    const range = required[key]
    if (range === undefined) continue
    const hostVersion = hostRuntime[key]
    if (hostVersion === undefined) {
      return `requires ${label} "${range}" but the host does not expose ${label} to remote bundles`
    }
    if (!runtimeRangeSatisfied(range, hostVersion)) {
      return `requires ${label} "${range}", host exposes ${label} ${hostVersion}`
    }
  }
  return undefined
}
