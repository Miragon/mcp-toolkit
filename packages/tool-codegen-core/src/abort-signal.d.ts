/**
 * Compile-time stand-in for the platform's `AbortSignal`.
 *
 * The package compiles against the ES2022 library alone, so neither DOM nor Node globals are in
 * scope and none can reach the runtime unnoticed: the code has to run unchanged in browsers, MCP
 * Apps widgets and Node. It only hands a signal through to the caller's transport and never reads
 * one, so the name is all it needs. This file is not emitted: the published declarations name the
 * global `AbortSignal`, which the consumer's DOM library or `@types/node` declares in full, the
 * same type `fetch`, the MCP SDK and TanStack Query speak.
 */
interface AbortSignal {
  readonly aborted: boolean
}
