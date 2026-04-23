import type { AppDefinition } from "@miragon/mcp-toolkit-core"
import { greetStep } from "./steps/greet.js"

export const definition: AppDefinition = {
  name: "hello",
  steps: [greetStep],
  widgets: [
    {
      id: "hello:greeting-card",
      requires: ["hello:greeting"],
      size: "half",
    },
  ],
}
