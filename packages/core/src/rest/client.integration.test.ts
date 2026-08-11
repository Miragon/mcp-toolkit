import http from "node:http"
import type { AddressInfo } from "node:net"
import { afterEach, describe, expect, it } from "vitest"

import { createRestClient } from "./client.js"
import { RestError } from "./errors.js"

/**
 * Integration tests for `createRestClient` against a REAL HTTP server
 * (`node:http` on a loopback socket, port from `listen(0)`), complementing
 * the fetch-stub unit tests in `client.test.ts`: what the client puts on the
 * wire is asserted as the *server* receives it, and error/edge responses are
 * produced by a real HTTP stack rather than a hand-built `Response`.
 */

/** What the server saw for the last request, captured for wire-level asserts. */
interface SeenRequest {
  method: string | undefined
  url: string | undefined
  headers: http.IncomingHttpHeaders
  body: string
}

let server: http.Server | undefined

afterEach(async () => {
  if (server) {
    const closing = server
    server = undefined
    await new Promise<void>((resolve, reject) => {
      closing.close((err) => (err ? reject(err) : resolve()))
    })
  }
})

/**
 * Boot a one-off server whose responses come from `respond`, recording each
 * request into the returned `seen` array. Returns the loopback base URL.
 */
async function startServer(
  respond: (req: http.IncomingMessage, res: http.ServerResponse) => void,
): Promise<{ baseUrl: string; seen: SeenRequest[] }> {
  const seen: SeenRequest[] = []
  server = http.createServer((req, res) => {
    const chunks: Buffer[] = []
    req.on("data", (chunk: Buffer) => chunks.push(chunk))
    req.on("end", () => {
      seen.push({
        method: req.method,
        url: req.url,
        headers: req.headers,
        body: Buffer.concat(chunks).toString("utf8"),
      })
      respond(req, res)
    })
  })
  const listening = server
  await new Promise<void>((resolve) => listening.listen(0, "127.0.0.1", resolve))
  const { port } = listening.address() as AddressInfo
  return { baseUrl: `http://127.0.0.1:${port}`, seen }
}

describe("createRestClient over real HTTP", () => {
  it("round-trips a 2xx JSON POST: body and content-type arrive on the wire, response is parsed", async () => {
    const { baseUrl, seen } = await startServer((_req, res) => {
      res.writeHead(200, { "content-type": "application/json" })
      res.end(JSON.stringify({ id: "o-1", total: 42 }))
    })
    const client = createRestClient({ baseUrl })

    const result = await client.request<{ id: string; total: number }>({
      method: "POST",
      path: "/orders",
      body: { customer: "c-1", total: 42 },
    })

    expect(result).toEqual({ id: "o-1", total: 42 })
    expect(seen).toHaveLength(1)
    expect(seen[0]!.method).toBe("POST")
    expect(seen[0]!.url).toBe("/orders")
    expect(seen[0]!.headers["content-type"]).toBe("application/json")
    expect(JSON.parse(seen[0]!.body)).toEqual({ customer: "c-1", total: 42 })
  })

  it("maps a real 404 to RestError with status, statusText, body, and the url in the message", async () => {
    const { baseUrl } = await startServer((_req, res) => {
      res.writeHead(404, { "content-type": "text/plain" })
      res.end("no such order")
    })
    const client = createRestClient({ baseUrl })

    const err: unknown = await client
      .request({ method: "GET", path: "/orders/missing" })
      .then(() => {
        throw new Error("expected the request to reject")
      })
      .catch((e: unknown) => e)

    expect(err).toBeInstanceOf(RestError)
    const restError = err as RestError
    expect(restError.status).toBe(404)
    expect(restError.statusText).toBe("Not Found")
    expect(restError.body).toBe("no such order")
    expect(restError.message).toContain(`${baseUrl}/orders/missing`)
  })

  it("maps a real 500 to RestError carrying the error body", async () => {
    const { baseUrl } = await startServer((_req, res) => {
      res.writeHead(500)
      res.end("boom")
    })
    const client = createRestClient({ baseUrl })

    await expect(client.request({ method: "GET", path: "/explode" })).rejects.toMatchObject({
      name: "RestError",
      status: 500,
      statusText: "Internal Server Error",
      body: "boom",
    })
  })

  it("rejects with a transport error (not a RestError) when the server is already closed", async () => {
    const { baseUrl } = await startServer((_req, res) => res.end())
    // Tear the server down before the call — the port is now dead.
    const closing = server!
    server = undefined
    await new Promise<void>((resolve, reject) => {
      closing.close((err) => (err ? reject(err) : resolve()))
    })

    const client = createRestClient({ baseUrl })
    const err: unknown = await client
      .request({ method: "GET", path: "/ping" })
      .then(() => {
        throw new Error("expected the request to reject")
      })
      .catch((e: unknown) => e)

    // A connection failure surfaces as fetch's transport error — it must not
    // be dressed up as an HTTP-level RestError.
    expect(err).toBeInstanceOf(Error)
    expect(err).not.toBeInstanceOf(RestError)
  })

  it("bearer auth arrives on the wire as a lowercase authorization header", async () => {
    const { baseUrl, seen } = await startServer((_req, res) => {
      res.writeHead(200, { "content-type": "application/json" })
      res.end("{}")
    })
    const client = createRestClient({
      baseUrl,
      auth: { mode: "bearer", token: "sekret" },
    })

    await client.request({ method: "GET", path: "/ping" })

    expect(seen[0]!.headers.authorization).toBe("Bearer sekret")
  })

  it("header-mode auth arrives on the wire under the configured (lowercased) name", async () => {
    const { baseUrl, seen } = await startServer((_req, res) => {
      res.writeHead(200, { "content-type": "application/json" })
      res.end("{}")
    })
    const client = createRestClient({
      baseUrl,
      auth: { mode: "header", headerName: "X-Api-Key", value: "k-123" },
    })

    await client.request({ method: "GET", path: "/ping" })

    expect(seen[0]!.headers["x-api-key"]).toBe("k-123")
  })

  it("serializes the query string as the server receives it: arrays repeat, null/undefined are skipped", async () => {
    const { baseUrl, seen } = await startServer((_req, res) => {
      res.writeHead(200, { "content-type": "application/json" })
      res.end("{}")
    })
    const client = createRestClient({ baseUrl })

    await client.request({
      method: "GET",
      path: "/search",
      query: { q: "foo bar", tag: ["a", "b"], page: 1, hidden: null, empty: undefined },
    })

    const params = new URL(seen[0]!.url!, baseUrl).searchParams
    expect(params.get("q")).toBe("foo bar")
    expect(params.getAll("tag")).toEqual(["a", "b"])
    expect(params.get("page")).toBe("1")
    expect(params.has("hidden")).toBe(false)
    expect(params.has("empty")).toBe(false)
  })

  it("returns undefined for a real 204 No Content", async () => {
    const { baseUrl } = await startServer((_req, res) => {
      res.writeHead(204)
      res.end()
    })
    const client = createRestClient({ baseUrl })

    const result = await client.request({ method: "DELETE", path: "/orders/o-1" })
    expect(result).toBeUndefined()
  })

  it("returns the raw text for a non-JSON content-type", async () => {
    const { baseUrl } = await startServer((_req, res) => {
      res.writeHead(200, { "content-type": "text/plain" })
      res.end("plain body")
    })
    const client = createRestClient({ baseUrl })

    const result = await client.request<string>({ method: "GET", path: "/ping" })
    expect(result).toBe("plain body")
  })
})
