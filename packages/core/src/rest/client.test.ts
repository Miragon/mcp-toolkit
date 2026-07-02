import { describe, expect, it } from "vitest"

import { createRestClient } from "./client.js"
import { RestError } from "./errors.js"

interface CapturedRequest {
  url: string
  init: RequestInit
}

function makeFetchStub(response: Response): {
  fetch: typeof fetch
  calls: CapturedRequest[]
} {
  const calls: CapturedRequest[] = []
  const stub: typeof fetch = (input, init) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url
    calls.push({ url, init: init ?? {} })
    return Promise.resolve(response)
  }
  return { fetch: stub, calls }
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  })
}

describe("createRestClient", () => {
  it("expands path templates and JSON-parses the response", async () => {
    const { fetch, calls } = makeFetchStub(jsonResponse(200, { id: "o-1", total: 42 }))
    const client = createRestClient({ baseUrl: "https://api.example.com/v2", fetch })

    const result = await client.request<{ id: string; total: number }>({
      method: "GET",
      path: "/orders/{orderId}",
      pathParams: { orderId: "o-1" },
    })

    expect(result).toEqual({ id: "o-1", total: 42 })
    expect(calls).toHaveLength(1)
    expect(calls[0]?.url).toBe("https://api.example.com/v2/orders/o-1")
  })

  it("encodes query parameters including arrays and skips null/undefined", async () => {
    const { fetch, calls } = makeFetchStub(jsonResponse(200, {}))
    const client = createRestClient({ baseUrl: "https://api.example.com", fetch })

    await client.request({
      method: "GET",
      path: "/search",
      query: { q: "foo bar", tag: ["a", "b"], page: 1, hidden: null, empty: undefined },
    })

    expect(calls[0]?.url).toBe("https://api.example.com/search?q=foo%20bar&tag=a&tag=b&page=1")
  })

  it("stamps bearer auth header", async () => {
    const { fetch, calls } = makeFetchStub(jsonResponse(200, {}))
    const client = createRestClient({
      baseUrl: "https://api.example.com",
      auth: { mode: "bearer", token: "abc123" },
      fetch,
    })

    await client.request({ method: "GET", path: "/ping" })

    const headers = calls[0]?.init.headers as Record<string, string>
    expect(headers.authorization).toBe("Bearer abc123")
  })

  it("stamps custom header auth with lowercased key", async () => {
    const { fetch, calls } = makeFetchStub(jsonResponse(200, {}))
    const client = createRestClient({
      baseUrl: "https://api.example.com",
      auth: { mode: "header", headerName: "X-Api-Key", value: "secret" },
      fetch,
    })

    await client.request({ method: "GET", path: "/ping" })

    const headers = calls[0]?.init.headers as Record<string, string>
    expect(headers["x-api-key"]).toBe("secret")
  })

  it("serializes object bodies as JSON and sets content-type", async () => {
    const { fetch, calls } = makeFetchStub(jsonResponse(201, {}))
    const client = createRestClient({ baseUrl: "https://api.example.com", fetch })

    await client.request({
      method: "POST",
      path: "/orders",
      body: { customer: "c-1", total: 99 },
    })

    const headers = calls[0]?.init.headers as Record<string, string>
    expect(headers["content-type"]).toBe("application/json")
    expect(calls[0]?.init.body).toBe(JSON.stringify({ customer: "c-1", total: 99 }))
  })

  it("throws RestError with status on non-2xx responses", async () => {
    const { fetch } = makeFetchStub(
      new Response("not found", { status: 404, statusText: "Not Found" }),
    )
    const client = createRestClient({ baseUrl: "https://api.example.com", fetch })

    await expect(client.request({ method: "GET", path: "/orders/missing" })).rejects.toMatchObject({
      name: "RestError",
      status: 404,
      body: "not found",
    })
  })

  it("returns undefined for 204 No Content", async () => {
    const { fetch } = makeFetchStub(new Response(null, { status: 204 }))
    const client = createRestClient({ baseUrl: "https://api.example.com", fetch })

    const result = await client.request({ method: "DELETE", path: "/orders/o-1" })
    expect(result).toBeUndefined()
  })

  it("throws when a required path parameter is missing", async () => {
    const { fetch } = makeFetchStub(jsonResponse(200, {}))
    const client = createRestClient({ baseUrl: "https://api.example.com", fetch })

    await expect(client.request({ method: "GET", path: "/orders/{orderId}" })).rejects.toThrow(
      /Missing path parameter "orderId"/,
    )
  })

  it("strips trailing slash from baseUrl", async () => {
    const { fetch, calls } = makeFetchStub(jsonResponse(200, {}))
    const client = createRestClient({ baseUrl: "https://api.example.com/v2/", fetch })

    await client.request({ method: "GET", path: "/ping" })
    expect(calls[0]?.url).toBe("https://api.example.com/v2/ping")
  })

  it("merges default headers, auth headers, and per-request headers (later wins)", async () => {
    const { fetch, calls } = makeFetchStub(jsonResponse(200, {}))
    const client = createRestClient({
      baseUrl: "https://api.example.com",
      auth: { mode: "bearer", token: "t" },
      defaultHeaders: { "x-client": "sdk-1", "x-trace": "default" },
      fetch,
    })

    await client.request({
      method: "GET",
      path: "/ping",
      headers: { "x-trace": "per-request" },
    })

    const headers = calls[0]?.init.headers as Record<string, string>
    expect(headers["x-client"]).toBe("sdk-1")
    expect(headers.authorization).toBe("Bearer t")
    expect(headers["x-trace"]).toBe("per-request")
  })

  it("returns raw text when response is not JSON", async () => {
    const { fetch } = makeFetchStub(
      new Response("plain body", { status: 200, headers: { "content-type": "text/plain" } }),
    )
    const client = createRestClient({ baseUrl: "https://api.example.com", fetch })

    const result = await client.request<string>({ method: "GET", path: "/ping" })
    expect(result).toBe("plain body")
  })

  it("RestError truncates overly long bodies for readability", () => {
    const body = "x".repeat(500)
    const err = new RestError(500, "Internal Server Error", body, "https://api.example.com/foo")
    expect(err.status).toBe(500)
    expect(err.body).toHaveLength(500)
    expect(err.message).toContain("…")
  })

  describe("request timeout", () => {
    // Rejects with the abort reason once the request's signal fires — models a
    // hung upstream that only ends when aborted.
    const hangingFetch: typeof fetch = (_input, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener(
          "abort",
          () => {
            const reason: unknown = init.signal?.reason
            reject(reason instanceof Error ? reason : new Error(String(reason)))
          },
          { once: true },
        )
      })

    it("passes an abort signal to fetch by default (timeout enabled)", async () => {
      const { fetch, calls } = makeFetchStub(jsonResponse(200, {}))
      const client = createRestClient({ baseUrl: "https://api.example.com", fetch })
      await client.request({ method: "GET", path: "/ping" })
      expect(calls[0]?.init.signal).toBeInstanceOf(AbortSignal)
    })

    it("aborts a hung request after the timeout and reports it clearly", async () => {
      const client = createRestClient({
        baseUrl: "https://api.example.com",
        fetch: hangingFetch,
        timeoutMs: 10,
      })
      await expect(client.request({ method: "GET", path: "/slow" })).rejects.toThrow(
        /timed out after 10ms/,
      )
    })

    it("honours a per-request timeout override", async () => {
      const client = createRestClient({
        baseUrl: "https://api.example.com",
        fetch: hangingFetch,
        timeoutMs: 0,
      })
      await expect(client.request({ method: "GET", path: "/slow", timeoutMs: 10 })).rejects.toThrow(
        /timed out after 10ms/,
      )
    })

    it("omits the abort signal when the timeout is disabled", async () => {
      const { fetch, calls } = makeFetchStub(jsonResponse(200, {}))
      const client = createRestClient({
        baseUrl: "https://api.example.com",
        fetch,
        timeoutMs: 0,
      })
      await client.request({ method: "GET", path: "/ping" })
      expect(calls[0]?.init.signal).toBeUndefined()
    })

    it("propagates a caller abort without masking it as a timeout", async () => {
      const controller = new AbortController()
      const client = createRestClient({
        baseUrl: "https://api.example.com",
        fetch: hangingFetch,
        timeoutMs: 0,
      })
      const pending = client.request({
        method: "GET",
        path: "/slow",
        signal: controller.signal,
      })
      controller.abort(new Error("caller cancelled"))
      await expect(pending).rejects.toThrow(/caller cancelled/)
    })
  })
})
