/**
 * Thrown by `RestClient.request` on non-2xx responses.
 *
 * `status` is picked up by `createToolRegistrar`'s error handler and
 * rendered as `[<status>] <message>` in the MCP tool response, so tool
 * authors do not need to translate HTTP errors manually.
 */
export class RestError extends Error {
  readonly status: number
  readonly statusText: string
  readonly body: string

  constructor(status: number, statusText: string, body: string, url: string) {
    const snippet = body.length > 200 ? `${body.slice(0, 200)}…` : body
    super(`HTTP ${status} ${statusText} for ${url}${snippet ? `: ${snippet}` : ""}`)
    this.name = "RestError"
    this.status = status
    this.statusText = statusText
    this.body = body
  }
}
