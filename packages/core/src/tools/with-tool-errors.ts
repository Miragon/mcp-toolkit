import { error } from "mcp-use"

/**
 * Wraps a raw `server.tool()` handler so thrown exceptions surface as the same
 * `error("[code] message")` tool result the toolkit's registrars produce. This
 * is the single source of truth for the registrar error format — both
 * `createToolRegistrar` and `createWidgetToolRegistrar` route their `catch`
 * paths through here, and tools that bypass the registrars (widget tools,
 * `*_data` feeds) can wrap their handlers to follow the house "use `error()`,
 * don't throw" convention.
 *
 * Code precedence matches the registrars: an HTTP-ish `status` (e.g. `404`)
 * wins over a domain error `code` (e.g. `ENGINE_NOT_SELECTED`); both may be a
 * `string` or `number`. When neither is present the message is returned as-is.
 */
export function withToolErrors<TArgs extends unknown[], TResult>(
  handler: (...args: TArgs) => Promise<TResult>,
): (...args: TArgs) => Promise<TResult | ReturnType<typeof error>> {
  return async (...args) => {
    try {
      return await handler(...args)
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      const { status, code } = (e ?? {}) as { status?: string | number; code?: string | number }
      const errorCode = status ?? code
      return error(errorCode ? `[${errorCode}] ${message}` : message)
    }
  }
}
