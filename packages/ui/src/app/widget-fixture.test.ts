import { describe, expect, it } from "vitest"
import { FixtureCallToolRegistry, buildFixtureWidgetProps } from "./widget-fixture.js"

describe("FixtureCallToolRegistry", () => {
  it("returns a static value entry wrapped under structuredContent", async () => {
    const reg = new FixtureCallToolRegistry()
    reg.register("get_thing", { id: "a", name: "Thing A" })

    const res = await reg.call("get_thing", {})

    expect(res.structuredContent).toEqual({ id: "a", name: "Thing A" })
    // Mirrored into a text block so mcp-use's text-first decoder also sees it.
    expect(res.content?.[0]?.text).toContain("Thing A")
  })

  it("passes a value entry through untouched when it already looks like a tool response", async () => {
    const reg = new FixtureCallToolRegistry({
      already_shaped: { structuredContent: { ok: true }, isError: false },
    })

    const res = await reg.call("already_shaped")

    expect(res).toEqual({ structuredContent: { ok: true }, isError: false })
  })

  it("invokes a handler entry with the call args and wraps the return value", async () => {
    const reg = new FixtureCallToolRegistry()
    reg.register("search", (args: Record<string, unknown>) => ({
      query: args.q,
      hits: [String(args.q)],
    }))

    const res = await reg.call("search", { q: "leasing" })

    expect(res.structuredContent).toEqual({ query: "leasing", hits: ["leasing"] })
  })

  it("awaits async handler entries", async () => {
    const reg = new FixtureCallToolRegistry()
    reg.register("slow", async (args: Record<string, unknown>) => {
      await Promise.resolve()
      return { echoed: args.value }
    })

    const res = await reg.call("slow", { value: 42 })

    expect(res.structuredContent).toEqual({ echoed: 42 })
  })

  it("wraps a string entry into both structuredContent and a text block", async () => {
    const reg = new FixtureCallToolRegistry({ greet: "hello" })

    const res = await reg.call("greet")

    expect(res.structuredContent).toBe("hello")
    expect(res.content?.[0]?.text).toBe("hello")
  })

  it("rejects unknown tools with a descriptive, name-listing error", async () => {
    const reg = new FixtureCallToolRegistry({ known: { ok: true } })

    await expect(reg.call("missing")).rejects.toThrow(/No fixture registered for tool "missing"/)
    await expect(reg.call("missing")).rejects.toThrow(/known/)
  })

  it("lists registered names and reports membership", () => {
    const reg = new FixtureCallToolRegistry({ a: 1, b: 2 })
    reg.register("c", 3)

    expect(reg.has("a")).toBe(true)
    expect(reg.has("z")).toBe(false)
    expect(reg.names().sort()).toEqual(["a", "b", "c"])
  })

  it("overwrites an existing fixture on re-register", async () => {
    const reg = new FixtureCallToolRegistry({ t: { v: 1 } })
    reg.register("t", { v: 2 })

    const res = await reg.call("t")

    expect(res.structuredContent).toEqual({ v: 2 })
  })
})

describe("buildFixtureWidgetProps", () => {
  it("uses the fixture data as the keys map and an empty pipeline by default", () => {
    const data = { "customers:customer": { name: "Acme" } }

    const props = buildFixtureWidgetProps(data)

    expect(props.keys).toBe(data)
    expect(props.context.keys).toBe(data)
    expect(props.context.steps).toEqual({})
    expect(props.context.errors).toEqual([])
  })

  it("seeds a pipeline step keyed by dataType for adaptDataWidget components", () => {
    const data = { value: 7 }

    const props = buildFixtureWidgetProps(data, "demo:metric")

    expect(props.context.steps.fixture?._dataType).toBe("demo:metric")
    expect(props.context.steps.fixture?.data).toBe(data)
    // The adapter scans steps by _dataType, so a matching step must exist.
    const match = Object.values(props.context.steps).find((s) => s._dataType === "demo:metric")
    expect(match?.data).toBe(data)
  })
})
