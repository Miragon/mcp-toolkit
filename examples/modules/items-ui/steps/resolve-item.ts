import type { PipelineStepDefinition } from "@miragon/mcp-toolkit-core"
import type { ItemsCallTool } from "../generated/tools.js"

/**
 * Resolves a single item via the federated `items_get-item` proxy tool.
 *
 * The `callTool` in `appConfig` is injected by `buildProxyAppConfigs` when
 * `plugin.proxyBinding === "items"`, with `userId` pre-bound by the pipeline
 * executor — so step code only deals with `(toolName, args)`.
 */
export const resolveItemStep: PipelineStepDefinition<{ callTool: ItemsCallTool }> = {
  id: "items-ui:resolve-item",
  dataType: "items-ui:item",
  requires: ["items-ui:itemId"],
  produces: ["items-ui:item"],
  async execute(ctx, { callTool }) {
    const id = String(ctx.keys["items-ui:itemId"])
    const item = await callTool("items_get-item", { id })
    return {
      _app: "items-ui",
      _step: "resolve-item",
      data: item,
      keys: { "items-ui:item": item },
    }
  },
}
