import type { AppPlugin } from "../types/app.js"
import type { UpstreamProxyPlugin } from "./UpstreamProxyPlugin.js"

/**
 * Builds the `appConfigs` map passed to `renderView` / `executePipeline`.
 * For each plugin that declares a `proxyBinding`, injects a `callTool`
 * closure that dispatches through the matching `UpstreamProxyPlugin`.
 *
 * The injected closure accepts a hidden 3rd `ctx` parameter (`{ userId }`).
 * The pipeline executor rewraps it into the 2-arg `TypedCallTool` shape
 * step code sees — see `pipeline-executor.ts:bindAppConfig`.
 *
 * Plugins without a `proxyBinding` pass through their existing `appConfig`
 * untouched. An unknown `proxyBinding` logs a warning and leaves the plugin
 * without a `callTool`; the step will throw a clear error at call time.
 */
export function buildProxyAppConfigs(
  plugins: AppPlugin[],
  proxies: UpstreamProxyPlugin[],
): Record<string, Record<string, unknown>> {
  const byName = new Map(proxies.map((p) => [p.name, p]))
  const out: Record<string, Record<string, unknown>> = {}

  for (const plugin of plugins) {
    const base = plugin.appConfig ?? {}
    if (!plugin.proxyBinding) {
      out[plugin.definition.name] = base
      continue
    }
    const proxy = byName.get(plugin.proxyBinding)
    if (!proxy) {
      console.warn(
        `[mcp-toolkit] plugin "${plugin.definition.name}" declares proxyBinding "${plugin.proxyBinding}" but no matching UpstreamProxyPlugin is registered — steps will fail at callTool time.`,
      )
      out[plugin.definition.name] = base
      continue
    }
    out[plugin.definition.name] = {
      ...base,
      callTool: (toolName: string, args: unknown, ctx?: { userId?: string }) =>
        proxy.callUpstream(toolName, args, ctx?.userId),
    }
  }

  return out
}
