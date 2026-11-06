import { describe, expect, it } from "vitest"
import { validateConfig } from "./config.js"

const valid = { name: "tasks", url: "http://localhost:3000/mcp", out: "./src/generated" }

function problems(config: unknown): string[] {
  try {
    validateConfig(config)
    return []
  } catch (error) {
    return (error as Error).message.split("\n").slice(1)
  }
}

describe("validateConfig", () => {
  it("returns a valid config as it is", () => {
    const full = {
      ...valid,
      react: true,
      auth: { mode: "bearer", token: "t" },
      headers: { "x-tenant": "acme" },
      overrides: {
        list_tasks: {
          input: "{ q: string }",
          output: "unknown",
          hook: "query",
          identifier: "listAll",
        },
      },
    }
    expect(validateConfig(full)).toBe(full)
    for (const auth of [{ mode: "none" }, { mode: "header", headerName: "X-Api-Key", value: "" }]) {
      expect(validateConfig({ ...valid, auth })).toEqual({ ...valid, auth })
    }
  })

  it("names the renamed 2.x keys and rejects unknown ones", () => {
    expect(
      problems({ proxyName: "tasks", upstreamUrl: valid.url, out: valid.out, extra: 1 }),
    ).toEqual([
      `  - "proxyName" was renamed to "name" in 3.0`,
      `  - "upstreamUrl" was renamed to "url" in 3.0`,
      `  - unknown key "extra"`,
      `  - "name" must start with a letter and contain only letters, digits, "-" and "_"`,
      `  - "url" must be an http(s) URL`,
    ])
  })

  it("checks name, url, out and react", () => {
    for (const name of ["", "1tasks", "-tasks", "tasks api", "tasks.api", 42]) {
      expect(problems({ ...valid, name })).toEqual([
        `  - "name" must start with a letter and contain only letters, digits, "-" and "_"`,
      ])
    }
    for (const name of ["t", "Tasks", "billing-api", "my_client2"]) {
      expect(problems({ ...valid, name })).toEqual([])
    }
    for (const url of [
      "localhost:3000",
      "ftp://host/mcp",
      "file:///etc/hosts",
      "",
      undefined,
      new URL("http://host/mcp"),
    ]) {
      expect(problems({ ...valid, url })).toEqual([`  - "url" must be an http(s) URL`])
    }
    expect(problems({ ...valid, url: "https://host/mcp" })).toEqual([])
    expect(problems({ ...valid, out: "" })).toEqual([`  - "out" must be a non-empty string`])
    expect(problems({ ...valid, out: undefined })).toEqual([`  - "out" must be a non-empty string`])
    expect(problems({ ...valid, react: "yes" })).toEqual([`  - "react" must be a boolean`])
  })

  it("checks auth without echoing secrets", () => {
    const authProblem = `  - "auth" must be { mode: "none" }, { mode: "bearer", token } or { mode: "header", headerName, value }`
    for (const auth of [
      "secret",
      { mode: "bearer" },
      { mode: "bearer", token: "" },
      { mode: "bearer", token: "  " },
      { mode: "bearer", token: "t", extra: "x" },
      { mode: "header", headerName: "bad name", value: "v" },
      { mode: "header", headerName: "X-Key" },
      { mode: "bearer", headerName: "X-Key", value: "v" },
      { mode: "header", headerName: 1, value: "v" },
      { mode: "header", headerName: "X-Key", value: 1 },
      { mode: "header", headerName: "X-Key", value: "v", token: "t" },
      { mode: "none", token: "secret-value" },
      { mode: "oauth" },
    ]) {
      const found = typeof auth === "string" ? [`  - "auth" must be an object`] : [authProblem]
      expect(problems({ ...valid, auth })).toEqual(found)
      expect(problems({ ...valid, auth }).join()).not.toContain("secret-value")
    }
  })

  it("checks headers", () => {
    expect(problems({ ...valid, headers: "x" })).toEqual([
      `  - "headers" must be an object of strings`,
    ])
    expect(problems({ ...valid, headers: { "bad name": "v", ok: 1, "x-ok": "v" } })).toEqual([
      `  - "headers" entry "bad name" must be a valid header name with a string value`,
      `  - "headers" entry "ok" must be a valid header name with a string value`,
    ])
  })

  // fetch refuses these values, and its error quotes them in full: a secret on stderr.
  it("rejects credentials in the url and broken header values, without echoing them", () => {
    const secret = "S3CRET-VALUE"
    expect(problems({ ...valid, url: `http://user:${secret}@localhost/mcp` })).toEqual([
      `  - "url" must not carry credentials: put them into "auth"`,
    ])
    for (const url of [`http://${secret}@localhost/mcp`, `http://:${secret}@localhost/mcp`]) {
      expect(problems({ ...valid, url })).toEqual([
        `  - "url" must not carry credentials: put them into "auth"`,
      ])
    }
    const broken = [
      `${secret}\nX-Injected: 1`,
      `${secret}\r`,
      `${secret}\u0000`,
      `${secret}\u007f`,
      `${secret}\u0085`,
      `${secret}\u2028`,
      `${secret}€`,
    ]
    for (const value of broken) {
      const found = [
        ...problems({ ...valid, headers: { "x-key": value } }),
        ...problems({ ...valid, auth: { mode: "bearer", token: value } }),
        ...problems({ ...valid, auth: { mode: "header", headerName: "X-Key", value } }),
      ]
      expect(found, JSON.stringify(value)).toEqual([
        `  - "headers" entry "x-key" must not contain line breaks, control characters or characters beyond Latin-1`,
        `  - "auth" token must not contain line breaks, control characters or characters beyond Latin-1`,
        `  - "auth" value must not contain line breaks, control characters or characters beyond Latin-1`,
      ])
      expect(found.join()).not.toContain(secret)
    }
    for (const value of ["tab\tok", "Latin-1 é ÿ ¡", " spaced ", "~!#"]) {
      expect(
        problems({ ...valid, headers: { "x-key": value }, auth: { mode: "bearer", token: value } }),
      ).toEqual([])
    }
  })

  it("checks overrides", () => {
    expect(problems({ ...valid, overrides: [] })).toEqual([
      `  - "overrides" must be an object keyed by tool name`,
    ])
    expect(
      problems({
        ...valid,
        overrides: { a: "string", b: { input: "", output: 1, hook: "read", typo: true } },
      }),
    ).toEqual([
      `  - "overrides" entry "a" must be an object`,
      `  - "overrides" entry "b" has the unknown key "typo"`,
      `  - "overrides" entry "b": "input" must be a non-empty TypeScript type`,
      `  - "overrides" entry "b": "output" must be a non-empty TypeScript type`,
      `  - "overrides" entry "b": "hook" must be "query" or "mutation"`,
    ])
    expect(problems({ ...valid, overrides: { a: { hook: "mutation" } } })).toEqual([])
    for (const identifier of ["", "1st", "list-all", "list all", "tâche", 42, ["listAll"]]) {
      expect(problems({ ...valid, overrides: { a: { identifier } } })).toEqual([
        `  - "overrides" entry "a": "identifier" must be a letter, then letters and digits`,
      ])
    }
    expect(problems({ ...valid, overrides: { a: { identifier: "listAll2" } } })).toEqual([])
  })

  it("rejects what is not an object", () => {
    for (const config of [undefined, null, "config", [valid]]) {
      expect(() => validateConfig(config)).toThrow(
        "invalid codegen config:\n  - the config must be an object",
      )
    }
  })
})
