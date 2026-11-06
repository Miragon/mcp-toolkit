import type { CodegenAuth } from "./fetch-tools.js"

/** Per-tool settings, keyed by the tool name as the server lists it. */
export interface ToolOverride {
  /** A TypeScript type expression that replaces the generated input type. */
  input?: string
  /** A TypeScript type expression that replaces the generated output type (e.g. when the tool has no `outputSchema`). */
  output?: string
  /** Forces the React hook kind; by default a tool gets a query hook only when it is annotated `readOnlyHint: true`. */
  hook?: "query" | "mutation"
  /**
   * Replaces the tool name as the source of its identifiers: `identifier: "searchTasks"` names
   * `<Name>SearchTasksInput`, the client method `searchTasks` and `use<Name>SearchTasksQuery`.
   * For a name that collides or has no ASCII letter or digit. A letter, then letters and digits.
   */
  identifier?: string
}

export interface CodegenConfig {
  /**
   * Names the generated client: `<Name>ToolMap`, `create<Name>Client`,
   * `use<Name><Tool>Query`/`Mutation`, and the React query-key namespace.
   * Starts with a letter; letters, digits, `-` and `_` only.
   */
  name: string
  /** Streamable HTTP endpoint of the MCP server. */
  url: string
  /** Static auth for the tools/list handshake (default: none). */
  auth?: CodegenAuth
  /** Extra request headers, sent after the auth header. */
  headers?: Record<string, string>
  /** Output directory. The CLI resolves it against the config file's directory. */
  out: string
  /** Also emit `hooks.tsx` with React hooks (default: false). */
  react?: boolean
  /** Per-tool overrides, keyed by the tool name as the server lists it. */
  overrides?: Record<string, ToolOverride>
}

const CONFIG_KEYS = new Set(["name", "url", "auth", "headers", "out", "react", "overrides"])
const RENAMED_KEYS: Record<string, string> = { proxyName: "name", upstreamUrl: "url" }
const OVERRIDE_KEYS = new Set(["input", "output", "hook", "identifier"])
const NAME = /^[A-Za-z][A-Za-z0-9_-]*$/
const IDENTIFIER = /^[A-Za-z][A-Za-z0-9]*$/
const HEADER_NAME = /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/
/** Tab, printable ASCII and Latin-1: what an HTTP header value may hold (no line breaks, no NUL). */
const HEADER_VALUE = /^[\t\x20-\x7e\xa0-\xff]*$/

/** An `http:` or `https:` URL. */
export function isHttpUrl(url: unknown): url is string {
  if (typeof url !== "string" || !URL.canParse(url)) return false
  const { protocol } = new URL(url)
  return protocol === "http:" || protocol === "https:"
}

/** A URL with a user name or password, which fetch refuses and its error would print in full. */
export function hasCredentials(url: string): boolean {
  const { username, password } = new URL(url)
  return username !== "" || password !== ""
}

/** An HTTP header name (an RFC 9110 token). */
export function isHeaderName(name: unknown): name is string {
  return typeof name === "string" && HEADER_NAME.test(name)
}

/**
 * A value fetch accepts in a header. A line break, NUL or a character beyond
 * Latin-1 makes it throw, and its error quotes the value: a secret on stderr.
 */
export function isHeaderValue(value: string): boolean {
  return HEADER_VALUE.test(value)
}

/**
 * Checks a config (a config module's default export is untyped at runtime)
 * and returns it typed; throws one error listing every problem.
 */
export function validateConfig(value: unknown): CodegenConfig {
  if (!isRecord(value)) throw configError(["the config must be an object"])
  const problems = [
    ...Object.keys(value).flatMap(keyProblem),
    ...nameProblems(value.name),
    ...urlProblems(value.url),
    ...(typeof value.out === "string" && value.out !== ""
      ? []
      : [`"out" must be a non-empty string`]),
    ...(value.react === undefined || typeof value.react === "boolean"
      ? []
      : [`"react" must be a boolean`]),
    ...headersProblems(value.headers),
    ...authProblems(value.auth),
    ...overridesProblems(value.overrides),
  ]
  if (problems.length > 0) throw configError(problems)
  return value as unknown as CodegenConfig
}

function configError(problems: readonly string[]): Error {
  return new Error(
    `invalid codegen config:\n${problems.map((problem) => `  - ${problem}`).join("\n")}`,
  )
}

function keyProblem(key: string): string[] {
  const renamed = RENAMED_KEYS[key]
  if (renamed !== undefined) return [`"${key}" was renamed to "${renamed}" in 3.0`]
  return CONFIG_KEYS.has(key) ? [] : [`unknown key ${JSON.stringify(key)}`]
}

function nameProblems(name: unknown): string[] {
  if (typeof name === "string" && NAME.test(name)) return []
  return [`"name" must start with a letter and contain only letters, digits, "-" and "_"`]
}

function urlProblems(url: unknown): string[] {
  if (!isHttpUrl(url)) return [`"url" must be an http(s) URL`]
  // Never echo the URL: it is the part that carries the secret.
  return hasCredentials(url) ? [`"url" must not carry credentials: put them into "auth"`] : []
}

/** The problem of a header value, naming only where it sits: the value may be a secret. */
function headerValueProblems(label: string, value: string): string[] {
  return isHeaderValue(value)
    ? []
    : [`${label} must not contain line breaks, control characters or characters beyond Latin-1`]
}

function headersProblems(headers: unknown): string[] {
  if (headers === undefined) return []
  if (!isRecord(headers)) return [`"headers" must be an object of strings`]
  return Object.entries(headers).flatMap(([name, value]) => {
    const label = `"headers" entry ${JSON.stringify(name)}`
    if (!isHeaderName(name) || typeof value !== "string") {
      return [`${label} must be a valid header name with a string value`]
    }
    return headerValueProblems(label, value)
  })
}

function authProblems(auth: unknown): string[] {
  if (auth === undefined) return []
  if (!isRecord(auth)) return [`"auth" must be an object`]
  const keys = Object.keys(auth).sort().join(",")
  if (auth.mode === "none" && keys === "mode") return []
  if (auth.mode === "bearer" && keys === "mode,token" && isNonEmptyString(auth.token)) {
    return headerValueProblems(`"auth" token`, auth.token)
  }
  if (
    auth.mode === "header" &&
    keys === "headerName,mode,value" &&
    isHeaderName(auth.headerName) &&
    typeof auth.value === "string"
  ) {
    return headerValueProblems(`"auth" value`, auth.value)
  }
  return [
    `"auth" must be { mode: "none" }, { mode: "bearer", token } or { mode: "header", headerName, value }`,
  ]
}

function overridesProblems(overrides: unknown): string[] {
  if (overrides === undefined) return []
  if (!isRecord(overrides)) return [`"overrides" must be an object keyed by tool name`]
  return Object.entries(overrides).flatMap(([tool, override]) => {
    const label = `"overrides" entry ${JSON.stringify(tool)}`
    if (!isRecord(override)) return [`${label} must be an object`]
    return [
      ...Object.keys(override)
        .filter((key) => !OVERRIDE_KEYS.has(key))
        .map((key) => `${label} has the unknown key ${JSON.stringify(key)}`),
      ...(["input", "output"] as const)
        .filter((key) => override[key] !== undefined && !isNonEmptyString(override[key]))
        .map((key) => `${label}: "${key}" must be a non-empty TypeScript type`),
      ...(override.hook === undefined || override.hook === "query" || override.hook === "mutation"
        ? []
        : [`${label}: "hook" must be "query" or "mutation"`]),
      ...(override.identifier === undefined ||
      (typeof override.identifier === "string" && IDENTIFIER.test(override.identifier))
        ? []
        : [`${label}: "identifier" must be a letter, then letters and digits`]),
    ]
  })
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim() !== ""
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
