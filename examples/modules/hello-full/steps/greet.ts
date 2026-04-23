import type { PipelineStepDefinition } from "@miragon/mcp-toolkit-core"

export const greetStep: PipelineStepDefinition = {
  id: "hello:greet",
  dataType: "hello:greeting",
  requires: ["hello:name"],
  produces: ["hello:greeting"],
  execute(ctx) {
    const raw = ctx.keys["hello:name"]
    const name = typeof raw === "string" ? raw : "world"
    const greeting = `Hello, ${name}!`
    return Promise.resolve({
      _app: "hello",
      _step: "greet",
      data: { greeting },
      keys: { "hello:greeting": greeting },
    })
  },
}
