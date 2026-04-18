import { describe, expect, it, vi } from "vitest"
import { z } from "zod"

import type { RestClient } from "./types.js"
import { createRestTool } from "./tool.js"

function makeClientStub(): {
  client: RestClient
  request: ReturnType<typeof vi.fn>
  setResponse: (value: unknown) => void
} {
  let response: unknown = {}
  const request = vi.fn(() => Promise.resolve(response))
  const client: RestClient = {
    baseUrl: "https://api.example.com",
    request: request as RestClient["request"],
  }
  return {
    client,
    request,
    setResponse: (value) => {
      response = value
    },
  }
}

describe("createRestTool", () => {
  it("extracts path placeholders from args and puts the rest into query for GET", async () => {
    const { client, request, setResponse } = makeClientStub()
    setResponse({ id: "o-1" })

    const tool = createRestTool({
      name: "get_order",
      description: "Fetch an order",
      method: "GET",
      path: "/orders/{orderId}",
      inputSchema: { orderId: z.string(), include: z.string().optional() },
    })

    const result = await tool.handler(client, { orderId: "o-1", include: "items" })

    expect(result).toEqual({ id: "o-1" })
    expect(request).toHaveBeenCalledWith({
      method: "GET",
      path: "/orders/{orderId}",
      pathParams: { orderId: "o-1" },
      query: { include: "items" },
      body: undefined,
      headers: undefined,
    })
  })

  it("puts non-path args into body for POST", async () => {
    const { client, request } = makeClientStub()

    const tool = createRestTool({
      name: "create_order",
      description: "Create an order",
      method: "POST",
      path: "/customers/{customerId}/orders",
    })

    await tool.handler(client, { customerId: "c-1", total: 99, currency: "EUR" })

    expect(request).toHaveBeenCalledWith({
      method: "POST",
      path: "/customers/{customerId}/orders",
      pathParams: { customerId: "c-1" },
      query: undefined,
      body: { total: 99, currency: "EUR" },
      headers: undefined,
    })
  })

  it("uses buildRequest override when provided", async () => {
    const { client, request } = makeClientStub()

    const tool = createRestTool<{ id: string; raw: unknown }>({
      name: "custom",
      description: "Custom request shaping",
      method: "PUT",
      path: "/things/{id}",
      buildRequest: (args) => ({
        pathParams: { id: args.id },
        body: { payload: args.raw },
        headers: { "x-custom": "1" },
      }),
    })

    await tool.handler(client, { id: "t-1", raw: { nested: true } })

    expect(request).toHaveBeenCalledWith({
      method: "PUT",
      path: "/things/{id}",
      pathParams: { id: "t-1" },
      query: undefined,
      body: { payload: { nested: true } },
      headers: { "x-custom": "1" },
    })
  })

  it("applies projection to raw response before returning", async () => {
    const { client, setResponse } = makeClientStub()
    setResponse({ id: "o-1", total: 100, _internal: "hidden", customer: { secret: "x" } })

    const tool = createRestTool<{ orderId: string }, { id: string; total: number }, { id: string }>(
      {
        name: "get_order",
        description: "Fetch projected order",
        method: "GET",
        path: "/orders/{orderId}",
        projection: (raw) => ({ id: raw.id }),
      },
    )

    const result = await tool.handler(client, { orderId: "o-1" })
    expect(result).toEqual({ id: "o-1" })
  })

  it("returns raw response unchanged when no projection is set", async () => {
    const { client, setResponse } = makeClientStub()
    const raw = { anything: true, goes: ["here"] }
    setResponse(raw)

    const tool = createRestTool({
      name: "get",
      description: "x",
      method: "GET",
      path: "/x",
    })

    const result = await tool.handler(client, {})
    expect(result).toBe(raw)
  })

  it("passes through tool metadata (description, category, annotations, inputSchema)", () => {
    const tool = createRestTool({
      name: "get_order",
      description: "Fetch",
      category: "orders",
      method: "GET",
      path: "/orders/{orderId}",
      inputSchema: { orderId: z.string() },
      annotations: { readOnlyHint: true },
    })

    expect(tool.name).toBe("get_order")
    expect(tool.description).toBe("Fetch")
    expect(tool.category).toBe("orders")
    expect(tool.annotations).toEqual({ readOnlyHint: true })
    expect(tool.inputSchema).toBeDefined()
  })

  it("wires formatResult so registrar receives a projected-type formatter", () => {
    const tool = createRestTool<{ id: string }, { id: string; total: number }, { id: string }>({
      name: "get_order",
      description: "Fetch",
      method: "GET",
      path: "/orders/{id}",
      projection: (raw) => ({ id: raw.id }),
      formatResult: (result) => `order ${result.id}`,
    })

    expect(tool.formatResult).toBeDefined()
    expect(tool.formatResult!({ id: "o-1" }, { id: "o-1" })).toBe("order o-1")
  })

  it("omits query entirely when no non-path args are present", async () => {
    const { client, request } = makeClientStub()

    const tool = createRestTool({
      name: "get",
      description: "x",
      method: "GET",
      path: "/orders/{orderId}",
    })

    await tool.handler(client, { orderId: "o-1" })

    expect(request).toHaveBeenCalledWith({
      method: "GET",
      path: "/orders/{orderId}",
      pathParams: { orderId: "o-1" },
      query: undefined,
      body: undefined,
      headers: undefined,
    })
  })

  it("omits body entirely when POST has no non-path args (avoids '{}' payload)", async () => {
    const { client, request } = makeClientStub()

    const tool = createRestTool({
      name: "trigger",
      description: "x",
      method: "POST",
      path: "/orders/{orderId}/ship",
    })

    await tool.handler(client, { orderId: "o-1" })

    expect(request).toHaveBeenCalledWith({
      method: "POST",
      path: "/orders/{orderId}/ship",
      pathParams: { orderId: "o-1" },
      query: undefined,
      body: undefined,
      headers: undefined,
    })
  })

  it("skips projection when response is undefined (e.g. 204)", async () => {
    const { client, setResponse } = makeClientStub()
    setResponse(undefined)
    const projection = vi.fn()

    const tool = createRestTool<{ id: string }, { id: string }, { id: string }>({
      name: "delete",
      description: "x",
      method: "DELETE",
      path: "/things/{id}",
      projection: projection as (raw: { id: string }) => { id: string },
    })

    const result = await tool.handler(client, { id: "t-1" })
    expect(result).toBeUndefined()
    expect(projection).not.toHaveBeenCalled()
  })
})
