import type { CallToolResult } from "@modelcontextprotocol/server"
import type { MCPServer } from "mcp-use"
import { describe, expect, it, vi } from "vitest"
import type { CataloguePayload } from "../framework/catalogue.js"
import { StepRegistry } from "../registry/step-registry.js"
import { WidgetRegistry } from "../registry/widget-registry.js"
import type { StepOutput } from "../types/context.js"
import type { PipelineStepDefinition } from "../types/step.js"
import { registerCatalogueTool } from "./register-catalogue-tool.js"

interface CapturedToolDefinition {
  name: string
  visibility?: string
}

type ToolCallback = (args: Record<string, unknown>, ctx?: unknown) => Promise<CallToolResult>

interface CapturedTool {
  definition: CapturedToolDefinition
  cb: ToolCallback
}

function createStubServer(): { server: MCPServer; tools: CapturedTool[] } {
  const tools: CapturedTool[] = []
  const server = {
    tool(definition: CapturedToolDefinition, cb: ToolCallback) {
      tools.push({ definition, cb })
    },
  }
  return { server: server as unknown as MCPServer, tools }
}

function textBlock(result: CallToolResult): string {
  const block = result.content[0]
  if (!block || block.type !== "text") {
    throw new Error("expected text content block")
  }
  return block.text
}

/** One step (`demo:load-invoice`) that turns `demo:invoiceId` into `demo:invoice`. */
const loadInvoiceStep: PipelineStepDefinition = {
  id: "demo:load-invoice",
  dataType: "demo:invoice",
  requires: ["demo:invoiceId"],
  produces: ["demo:invoice"],
  // eslint-disable-next-line @typescript-eslint/require-await -- PipelineStepDefinition.execute is async by contract
  async execute(): Promise<StepOutput> {
    const invoice = { number: "INV-1", total: 42 }
    return { _app: "demo", _step: "load-invoice", data: invoice, keys: { "demo:invoice": invoice } }
  },
}

function setup(options?: { step?: PipelineStepDefinition; toolName?: string }) {
  const stepRegistry = new StepRegistry()
  stepRegistry.register(options?.step ?? loadInvoiceStep)

  const widgetRegistry = new WidgetRegistry()
  widgetRegistry.register({ id: "demo:card", requires: ["demo:invoice"], size: "half" })
  widgetRegistry.register({ id: "demo:ghost", requires: ["demo:missing"], size: "full" })

  const { server, tools } = createStubServer()
  registerCatalogueTool(server, {
    stepRegistry,
    widgetRegistry,
    appConfigs: {},
    ...(options?.toolName ? { toolName: options.toolName } : {}),
  })
  return { tools }
}

describe("registerCatalogueTool", () => {
  it("registers `get-builder-catalogue` as an app-only tool", () => {
    const { tools } = setup()
    expect(tools).toHaveLength(1)
    expect(tools[0]!.definition.name).toBe("get-builder-catalogue")
    expect(tools[0]!.definition.visibility).toBe("app")
  })

  it("honours the toolName override", () => {
    const { tools } = setup({ toolName: "custom-catalogue" })
    expect(tools[0]!.definition.name).toBe("custom-catalogue")
  })

  it("mirrors the catalogue into both the text channel and structuredContent", async () => {
    const { tools } = setup()
    const result = await tools[0]!.cb({
      keys: { "demo:invoiceId": "INV-1" },
      steps: [{ id: "invoice", step: "demo:load-invoice" }],
    })

    const payload = result.structuredContent as CataloguePayload
    expect(payload.reachableWidgets.map((w) => w.id)).toEqual(["demo:card"])
    expect(payload.context.keys).toMatchObject({ "demo:invoiceId": "INV-1" })

    // The text channel is the builder/model-facing summary of the same payload.
    const text = textBlock(result)
    expect(text).toContain(`Reachable widgets: ${payload.reachableWidgets.length}`)
    expect(text).toContain("demo:invoiceId")
    expect(text).toContain("demo:invoice")
  })

  it("reflects the registered steps and widgets, running configured steps for reachability", async () => {
    const { tools } = setup()
    const result = await tools[0]!.cb({
      keys: { "demo:invoiceId": "INV-1" },
      steps: [{ id: "invoice", step: "demo:load-invoice" }],
    })
    const payload = result.structuredContent as CataloguePayload

    // The step catalogue mirrors the registry, with app attribution.
    expect(payload.availableSteps).toEqual([
      {
        id: "demo:load-invoice",
        app: "demo",
        dataType: "demo:invoice",
        requires: ["demo:invoiceId"],
        produces: ["demo:invoice"],
      },
    ])

    // The configured step ran: its output landed in the context…
    expect(payload.context.stepIds).toEqual(["invoice"])
    expect(payload.context.errors).toEqual([])
    expect(payload.context.stepData.invoice).toMatchObject({
      _app: "demo",
      _dataType: "demo:invoice",
      data: { number: "INV-1", total: 42 },
    })

    // …which makes `demo:card` reachable while `demo:ghost` stays unreachable
    // with its missing key named.
    expect(payload.reachableWidgets.map((w) => w.id)).toEqual(["demo:card"])
    expect(payload.unreachableWidgets).toEqual([
      {
        id: "demo:ghost",
        app: "demo",
        requires: ["demo:missing"],
        size: "full",
        missingKeys: ["demo:missing"],
      },
    ])

    // The key catalogue attributes producers/consumers and in-context state.
    const invoiceKey = payload.keyCatalog.find((k) => k.key === "demo:invoice")
    expect(invoiceKey).toMatchObject({
      producedBySteps: ["demo:load-invoice"],
      consumedByWidgets: ["demo:card"],
      inContext: true,
    })
    const ghostKey = payload.keyCatalog.find((k) => k.key === "demo:missing")
    expect(ghostKey).toMatchObject({ consumedByWidgets: ["demo:ghost"], inContext: false })
  })

  describe("userId extraction from ctx.auth.user.userId", () => {
    /**
     * The userId is observable through the executor's `bindAppConfig` rewrap:
     * a step's `appConfig.callTool` closure receives `{ userId }` as its
     * hidden third argument.
     */
    function setupWithCallTool() {
      const stepRegistry = new StepRegistry()
      const whoamiStep: PipelineStepDefinition = {
        id: "demo:whoami",
        dataType: "demo:identity",
        requires: [],
        produces: [],
        async execute(_context, appConfig): Promise<StepOutput> {
          const { callTool } = appConfig as {
            callTool: (name: string, args: unknown) => Promise<unknown>
          }
          await callTool("whoami", {})
          return { _app: "demo", _step: "whoami", data: {}, keys: {} }
        },
      }
      stepRegistry.register(whoamiStep)

      const callTool = vi.fn<
        (name: string, args: unknown, ctx?: { userId?: string }) => Promise<unknown>
      >(() => Promise.resolve({}))
      const { server, tools } = createStubServer()
      registerCatalogueTool(server, {
        stepRegistry,
        widgetRegistry: new WidgetRegistry(),
        appConfigs: { demo: { callTool } },
      })
      return { cb: tools[0]!.cb, callTool }
    }

    const params = { steps: [{ id: "me", step: "demo:whoami" }] }

    it("threads a string ctx.auth.user.userId through to the step's callTool", async () => {
      const { cb, callTool } = setupWithCallTool()
      await cb(params, { auth: { user: { userId: "alice" } } })
      expect(callTool).toHaveBeenCalledExactlyOnceWith("whoami", {}, { userId: "alice" })
    })

    it("passes userId: undefined when the ctx carries no auth at all", async () => {
      const { cb, callTool } = setupWithCallTool()
      await cb(params)
      expect(callTool).toHaveBeenCalledExactlyOnceWith("whoami", {}, { userId: undefined })
    })

    it("treats a non-string userId as absent rather than coercing it", async () => {
      const { cb, callTool } = setupWithCallTool()
      await cb(params, { auth: { user: { userId: 42 } } })
      expect(callTool).toHaveBeenCalledExactlyOnceWith("whoami", {}, { userId: undefined })
    })
  })
})
