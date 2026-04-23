import type { AppDefinition } from "@miragon/mcp-toolkit-core"
import { resolveItemStep } from "./steps/resolve-item.js"

export const definition: AppDefinition = {
  name: "items-ui",
  steps: [resolveItemStep],
  widgets: [
    {
      id: "items-ui:item-card",
      requires: ["items-ui:item"],
      size: "half",
    },
  ],
}
