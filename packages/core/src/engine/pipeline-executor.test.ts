import { describe, it, expect, vi } from "vitest"
import { executePipeline } from "./pipeline-executor.js"
import { StepRegistry } from "../registry/step-registry.js"
import type { PipelineStepDefinition } from "../types/step.js"

const step = (overrides: Partial<PipelineStepDefinition> = {}): PipelineStepDefinition => ({
  id: "demo:noop",
  dataType: "demo:data",
  requires: [],
  produces: [],
  execute: () =>
    Promise.resolve({
      data: null,
      keys: {},
      _app: "demo",
      _step: "noop",
      _dataType: "demo:data",
    }),
  ...overrides,
})

describe("executePipeline", () => {
  it("returns the initial keys and no steps for an empty config", async () => {
    const ctx = await executePipeline({
      config: {},
      initialKeys: { seed: 1 },
      registry: new StepRegistry(),
    })
    expect(ctx).toEqual({ steps: {}, keys: { seed: 1 }, errors: [] })
  })

  it("runs steps in order and merges produced keys into context.keys", async () => {
    const registry = new StepRegistry()
    registry.register(
      step({
        id: "demo:a",
        produces: ["demo:x"],
        execute: () =>
          Promise.resolve({
            data: { fromA: true },
            keys: { "demo:x": "from-a" },
            _app: "demo",
            _step: "a",
            _dataType: "demo:data",
          }),
      }),
    )
    registry.register(
      step({
        id: "demo:b",
        requires: ["demo:x"],
        produces: ["demo:y"],
        execute: (context) =>
          Promise.resolve({
            data: { sawX: context.keys["demo:x"] },
            keys: { "demo:y": "from-b" },
            _app: "demo",
            _step: "b",
            _dataType: "demo:data",
          }),
      }),
    )

    const ctx = await executePipeline({
      config: {
        steps: [
          { id: "a", step: "demo:a" },
          { id: "b", step: "demo:b" },
        ],
      },
      initialKeys: {},
      registry,
    })

    expect(ctx.errors).toEqual([])
    expect(ctx.keys).toEqual({ "demo:x": "from-a", "demo:y": "from-b" })
    expect(ctx.steps.b?.data).toEqual({ sawX: "from-a" })
    expect(ctx.steps.b?._dataType).toBe("demo:data")
  })

  it("does not merge undefined produced keys, so a dependent step sees them as missing", async () => {
    // A step that "produces" a key but resolves it to `undefined` (e.g. a
    // declarative `outputMapping` dot-path that missed because the upstream
    // tool returned an unexpected shape) must NOT satisfy a later step's
    // `requires` gate — otherwise the dependent step runs against missing data.
    const registry = new StepRegistry()
    registry.register(
      step({
        id: "demo:a",
        produces: ["demo:x"],
        execute: () =>
          Promise.resolve({
            data: null,
            keys: { "demo:x": undefined },
            _app: "demo",
            _step: "a",
            _dataType: "demo:data",
          }),
      }),
    )
    const bRan = vi.fn()
    registry.register(
      step({
        id: "demo:b",
        requires: ["demo:x"],
        produces: ["demo:y"],
        execute: () => {
          bRan()
          return Promise.resolve({
            data: null,
            keys: { "demo:y": "from-b" },
            _app: "demo",
            _step: "b",
            _dataType: "demo:data",
          })
        },
      }),
    )

    const ctx = await executePipeline({
      config: {
        steps: [
          { id: "a", step: "demo:a" },
          { id: "b", step: "demo:b" },
        ],
      },
      initialKeys: {},
      registry,
    })

    expect(bRan).not.toHaveBeenCalled()
    expect("demo:x" in ctx.keys).toBe(false)
    expect(ctx.keys).toEqual({})
    expect(ctx.errors).toEqual([{ stepId: "b", reason: "Missing required keys: demo:x" }])
  })

  it("records an error and continues when a referenced step is not registered", async () => {
    const ctx = await executePipeline({
      config: {
        steps: [
          { id: "ghost", step: "demo:missing" },
          { id: "noop", step: "demo:noop" },
        ],
      },
      initialKeys: {},
      registry: seededRegistry(),
    })
    expect(ctx.errors).toEqual([{ stepId: "ghost", reason: 'Step "demo:missing" not registered' }])
    expect(ctx.steps.noop).toBeDefined()
  })

  it("silently skips an unregistered step when the ref is marked optional", async () => {
    const ctx = await executePipeline({
      config: { steps: [{ id: "ghost", step: "demo:missing", optional: true }] },
      initialKeys: {},
      registry: new StepRegistry(),
    })
    expect(ctx.errors).toEqual([])
  })

  it("records an error and continues when required keys are absent", async () => {
    const registry = new StepRegistry()
    registry.register(step({ id: "demo:needsKey", requires: ["demo:missing"] }))
    const ctx = await executePipeline({
      config: { steps: [{ id: "needs", step: "demo:needsKey" }] },
      initialKeys: {},
      registry,
    })
    expect(ctx.errors).toEqual([{ stepId: "needs", reason: "Missing required keys: demo:missing" }])
  })

  it("silently skips a step with missing required keys when optional", async () => {
    const registry = new StepRegistry()
    registry.register(step({ id: "demo:needsKey", requires: ["demo:missing"] }))
    const ctx = await executePipeline({
      config: { steps: [{ id: "needs", step: "demo:needsKey", optional: true }] },
      initialKeys: {},
      registry,
    })
    expect(ctx.errors).toEqual([])
  })

  it("captures synchronous and asynchronous execution errors", async () => {
    const registry = new StepRegistry()
    registry.register(
      step({
        id: "demo:sync",
        execute: () => {
          throw new Error("sync-fail")
        },
      }),
    )
    registry.register(
      step({ id: "demo:async", execute: () => Promise.reject(new Error("async-fail")) }),
    )

    const ctx = await executePipeline({
      config: {
        steps: [
          { id: "s", step: "demo:sync" },
          { id: "a", step: "demo:async" },
        ],
      },
      initialKeys: {},
      registry,
    })

    expect(ctx.errors).toEqual([
      { stepId: "s", reason: "sync-fail" },
      { stepId: "a", reason: "async-fail" },
    ])
  })

  it("stringifies non-Error throw values into the reason", async () => {
    const registry = new StepRegistry()
    registry.register(
      step({
        id: "demo:weird",
        // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors -- this tests the executor's handling of non-Error rejections
        execute: () => Promise.reject("plain-string"),
      }),
    )
    const ctx = await executePipeline({
      config: { steps: [{ id: "w", step: "demo:weird" }] },
      initialKeys: {},
      registry,
    })
    expect(ctx.errors).toEqual([{ stepId: "w", reason: "plain-string" }])
  })

  it("skips a throwing step entirely when the ref is optional", async () => {
    const registry = new StepRegistry()
    registry.register(step({ id: "demo:boom", execute: () => Promise.reject(new Error("nope")) }))
    const ctx = await executePipeline({
      config: { steps: [{ id: "b", step: "demo:boom", optional: true }] },
      initialKeys: {},
      registry,
    })
    expect(ctx.errors).toEqual([])
  })

  it("passes the matching appConfig (by step app prefix) into execute()", async () => {
    const registry = new StepRegistry()
    const seen = vi.fn()
    registry.register(
      step({
        id: "demo:probe",
        execute: (_ctx, appConfig) => {
          seen(appConfig)
          return Promise.resolve({
            data: null,
            keys: {},
            _app: "demo",
            _step: "probe",
            _dataType: "demo:data",
          })
        },
      }),
    )
    await executePipeline({
      config: { steps: [{ id: "p", step: "demo:probe" }] },
      initialKeys: {},
      registry,
      appConfigs: { demo: { label: "Demo" } },
    })
    expect(seen).toHaveBeenCalledWith({ label: "Demo" })
  })

  it("rewraps appConfig.callTool with the executor ctx so step code stays 2-arg", async () => {
    const registry = new StepRegistry()
    const inner = vi.fn().mockResolvedValue({ ok: true })
    let received: unknown
    registry.register(
      step({
        id: "demo:call",
        execute: async (_ctx, appConfig) => {
          const cfg = appConfig as { callTool: (n: string, a: unknown) => Promise<unknown> }
          received = await cfg.callTool("get", { id: 1 })
          return {
            data: null,
            keys: {},
            _app: "demo",
            _step: "call",
            _dataType: "demo:data",
          }
        },
      }),
    )
    await executePipeline({
      config: { steps: [{ id: "c", step: "demo:call" }] },
      initialKeys: {},
      registry,
      appConfigs: { demo: { callTool: inner } },
      ctx: { userId: "alice" },
    })
    expect(inner).toHaveBeenCalledWith("get", { id: 1 }, { userId: "alice" })
    expect(received).toEqual({ ok: true })
  })

  it("passes appConfig through unchanged when callTool is absent or non-function", async () => {
    const registry = new StepRegistry()
    let saw: unknown
    registry.register(
      step({
        id: "demo:see",
        execute: (_ctx, appConfig) => {
          saw = appConfig
          return Promise.resolve({
            data: null,
            keys: {},
            _app: "demo",
            _step: "see",
            _dataType: "demo:data",
          })
        },
      }),
    )

    await executePipeline({
      config: { steps: [{ id: "x", step: "demo:see" }] },
      initialKeys: {},
      registry,
      appConfigs: { demo: { callTool: "not-a-function", label: "Demo" } },
      ctx: { userId: "alice" },
    })
    expect(saw).toEqual({ callTool: "not-a-function", label: "Demo" })

    await executePipeline({
      config: { steps: [{ id: "x", step: "demo:see" }] },
      initialKeys: {},
      registry,
      appConfigs: { demo: { label: "Demo" } },
      ctx: { userId: "alice" },
    })
    expect(saw).toEqual({ label: "Demo" })
  })

  it("defaults appConfig to {} when no entry matches the step's app prefix", async () => {
    const registry = new StepRegistry()
    let saw: unknown
    registry.register(
      step({
        id: "demo:see",
        execute: (_ctx, appConfig) => {
          saw = appConfig
          return Promise.resolve({
            data: null,
            keys: {},
            _app: "demo",
            _step: "see",
            _dataType: "demo:data",
          })
        },
      }),
    )
    await executePipeline({
      config: { steps: [{ id: "x", step: "demo:see" }] },
      initialKeys: {},
      registry,
    })
    expect(saw).toEqual({})
  })
})

function seededRegistry(): StepRegistry {
  const r = new StepRegistry()
  r.register(step({ id: "demo:noop" }))
  return r
}
