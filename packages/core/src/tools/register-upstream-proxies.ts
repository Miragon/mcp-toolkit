import type { MCPServer } from "mcp-use/server"
import type { ProxyConfigEntry } from "@miragon/mcp-toolkit-proxy-contract"
import {
  UpstreamProxyPlugin,
  type UpstreamProxyPluginOptions,
} from "../proxy/UpstreamProxyPlugin.js"
import type { UpstreamAuthConfig } from "../proxy/types.js"

export interface RegisterUpstreamProxiesOptions {
  entries: ProxyConfigEntry[]
  /**
   * Public base URL the upstream IdPs redirect back to for oauth2 proxies.
   * Required only when any entry uses `auth.mode === "oauth2"`. Typically the
   * MCP server's own public URL.
   */
  callbackBaseUrl?: string
  /**
   * Resolves a secret env var to its value. Defaults to reading
   * `process.env`, but consumers can swap in a WorkOS Vault / Doppler / etc.
   * backed resolver when booting in a managed environment.
   */
  secretResolver?: (name: string) => string | undefined
}

/**
 * Instantiates one `UpstreamProxyPlugin` per config entry and mounts it on
 * the given server. Follows the two-phase lifecycle the plugin expects:
 *
 * 1. `registerTools(server)` — sync, mounts oauth callback routes + the
 *    authenticate tool. Routes must land before `server.listen()` or requests
 *    will 404.
 * 2. `init(server)` — awaited in parallel. Static-auth modes connect to the
 *    upstream and federate tools now; oauth2 modes defer until the user runs
 *    `<proxy>_authenticate`.
 *
 * Returns the created plugin list (handy for tests and for wiring into
 * `buildProxyAppConfigs` downstream).
 */
export async function registerUpstreamProxies(
  server: MCPServer,
  options: RegisterUpstreamProxiesOptions,
): Promise<UpstreamProxyPlugin[]> {
  const { entries } = options
  if (entries.length === 0) return []

  const resolveSecret = options.secretResolver ?? ((name: string) => process.env[name])
  const callbackBaseUrl = requireCallbackBaseUrl(entries, options.callbackBaseUrl)

  const plugins = entries.map((entry) => {
    const pluginOptions: UpstreamProxyPluginOptions = {
      name: entry.name,
      label: entry.label,
      upstreamUrl: entry.upstreamUrl,
      auth: resolveAuthConfig(entry, resolveSecret),
      callbackBaseUrl,
    }
    return new UpstreamProxyPlugin(pluginOptions)
  })

  for (const plugin of plugins) plugin.registerTools(server)
  await Promise.all(plugins.map((plugin) => plugin.init(server)))

  return plugins
}

export function resolveAuthConfig(
  entry: ProxyConfigEntry,
  resolveSecret: (name: string) => string | undefined,
): UpstreamAuthConfig {
  switch (entry.auth.mode) {
    case "none":
      return { mode: "none" }
    case "bearer": {
      const token = requireSecret(resolveSecret, entry.auth.tokenEnvVar, entry.name, "bearer token")
      return { mode: "bearer", token }
    }
    case "header": {
      const value = requireSecret(
        resolveSecret,
        entry.auth.valueEnvVar,
        entry.name,
        `header "${entry.auth.headerName}"`,
      )
      return { mode: "header", headerName: entry.auth.headerName, value }
    }
    case "oauth2":
      return { mode: "oauth2", clientName: entry.label }
  }
}

function requireSecret(
  resolve: (name: string) => string | undefined,
  envVar: string,
  proxyName: string,
  description: string,
): string {
  const value = resolve(envVar)
  if (!value || value === "") {
    throw new Error(`MCP proxy "${proxyName}": env var ${envVar} (${description}) is not set.`)
  }
  return value
}

export function requireCallbackBaseUrl(
  entries: ProxyConfigEntry[],
  provided: string | undefined,
): string | undefined {
  const needsCallback = entries.some((e) => e.auth.mode === "oauth2")
  if (!needsCallback) return undefined
  if (!provided) {
    throw new Error(
      "registerUpstreamProxies: callbackBaseUrl is required when any entry uses oauth2.",
    )
  }
  return provided.replace(/\/+$/, "")
}
