import type { AppPlugin } from "@miragon/mcp-toolkit-core"
import { definition } from "./definition.js"

/**
 * UI-only example: no `registerTools`. All tool calls dispatch through the
 * `items` upstream proxy (federated as `items_<tool>`), and the typed
 * `callTool` closure is injected into `appConfig` at boot by
 * `buildProxyAppConfigs` via the `proxyBinding` field.
 */
export function createPlugin(): AppPlugin {
  return {
    definition,
    proxyBinding: "items",
  }
}
