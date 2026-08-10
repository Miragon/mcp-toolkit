import { errorResult } from "./tool-results.js"

/**
 * Wraps a raw `server.tool()` handler so thrown exceptions surface as the same
 * `[code] message` error result the toolkit's registrars produce. This is the
 * single source of truth for the registrar error format — both
 * `createToolRegistrar` and `createWidgetToolRegistrar` route their `catch`
 * paths through here, and tools that bypass the registrars (widget tools,
 * `*_data` feeds) can wrap their handlers to follow the house "return an
 * error result, don't throw" convention.
 *
 * Code precedence matches the registrars: an HTTP-ish `status` (e.g. `404`)
 * wins over a domain error `code` (e.g. `ENGINE_NOT_SELECTED`); both may be a
 * `string` or `number`. When neither is present the message is returned as-is.
 *
 * The error branch (`errorResult`) carries a literal `isError: true`: tools
 * with an `outputSchema` — every view-bound tool since the native-views move —
 * have a callback type demanding either matching `structuredContent` or an
 * explicit `isError: true` result, and the literal is what lets wrapped
 * handlers register without casts.
 */
export function withToolErrors<TArgs extends unknown[], TResult>(
  handler: (...args: TArgs) => Promise<TResult>,
): (...args: TArgs) => Promise<TResult | ReturnType<typeof errorResult>> {
  return async (...args) => {
    try {
      return await handler(...args)
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      const { status, code } = (e ?? {}) as { status?: string | number; code?: string | number }
      const errorCode = status ?? code
      return errorResult(errorCode ? `[${errorCode}] ${message}` : message)
    }
  }
}
