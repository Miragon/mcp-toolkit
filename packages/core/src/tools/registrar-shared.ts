import type { RequestContext, ToolDefinition } from "mcp-use"
import { z } from "zod"

/** Input shape both registrars accept: a raw zod shape, wrapped into an object schema. */
export type ZodRawShape = Record<string, z.ZodTypeAny>

/**
 * mcp-use's per-call context, handed to registrar handlers as their third
 * argument: `signal` (aborts when the client cancels or the connection
 * drops), `reportProgress`, `sendLog`, `sendNotification`, `client`
 * (capability queries), the originating `request`, and `auth`.
 *
 * `auth` is typed optional on purpose: plugins receive their server as a
 * plain `MCPServer` even when the composition root installed OAuth
 * (`createFrameworkApp` erases the user type), and a tool whose
 * `securitySchemes` accept `noauth` runs signed out. `TUser` is the server's
 * OAuth user type when the registrar was created from an `MCPServer<TUser>`,
 * `unknown` otherwise.
 */
export type ToolHandlerContext<TUser = unknown> = RequestContext<TUser, "optional">

/** The ctx user type a registrar created from an `MCPServer<TUser>` hands its handlers. */
export type HandlerUser<TUser> = [TUser] extends [never] ? unknown : TUser

/** `ToolDefinition` keys every registrar derives itself from its config. */
type RegistrarOwnedKey =
  "name" | "description" | "inputSchema" | "schema" | "outputSchema" | "annotations"

/**
 * The `ToolDefinition` fields `createToolRegistrar` forwards verbatim to
 * `server.tool` (`definition`): `title`, `_meta`, `visibility`,
 * `securitySchemes`, `view`, and any field a later mcp-use adds. The keys
 * the registrar derives from its own config are excluded — they win.
 */
export type ToolDefinitionPassthrough = Omit<ToolDefinition, RegistrarOwnedKey>

/**
 * The `ToolDefinition` fields `createWidgetToolRegistrar` forwards verbatim
 * (`definition`) — e.g. `securitySchemes`. On top of the shared owned keys
 * the widget registrar derives `title`, `visibility`, `view` and `_meta`
 * from its config (`title`, `visibility`, `meta`), so those stay excluded.
 */
export type WidgetToolDefinitionPassthrough = Omit<
  ToolDefinition,
  RegistrarOwnedKey | "title" | "visibility" | "view" | "_meta"
>

/** Options shared by `createToolRegistrar` and `createWidgetToolRegistrar`. */
export interface ToolRegistrarOptions {
  /**
   * Default for every tool's `strictInput` (a tool's own flag wins). Off by
   * default in 2.x: a non-strict input silently strips unknown keys.
   */
  strictInput?: boolean
  /**
   * Type `register()`'s return value as the tool's mcp-use `ToolRef` (name,
   * input and output types — what `mcp-env.d.ts` / `useCallTool` infer from).
   * The ref is returned at runtime either way; the static type is opt-in in
   * 2.x because registrar wrappers typed as
   * `ReturnType<typeof createToolRegistrar<C>>` may return `void` (a toolset
   * filter registers nothing for a filtered tool).
   */
  toolRefs?: boolean
}

/** The registrar options that select the `ToolRef`-typed registrar. */
export type TypedToolRefOptions = ToolRegistrarOptions & { toolRefs: true }

/**
 * The message for unknown keys on a strict input: names every unknown key
 * and every valid one, so a model can correct a typo in one retry instead of
 * having the key silently dropped.
 */
export function unknownKeysMessage(unknown: readonly string[], valid: readonly string[]): string {
  const quote = (keys: readonly string[]) => keys.map((key) => JSON.stringify(key)).join(", ")
  const head = `Unknown key${unknown.length === 1 ? "" : "s"} ${quote(unknown)}.`
  return valid.length === 0
    ? `${head} This tool takes no arguments.`
    : `${head} Valid keys: ${quote(valid)}.`
}

/**
 * A strict object schema for a raw input shape: advertised with
 * `additionalProperties: false`, and an unknown key fails validation with
 * {@link unknownKeysMessage}. mcp-use's SDK runs input validation before the
 * callback and returns the failure as an `isError` tool result.
 */
export function strictInputSchema(shape: ZodRawShape): z.ZodObject<ZodRawShape, z.core.$strict> {
  const valid = Object.keys(shape)
  return z.strictObject(shape, {
    error: (issue) =>
      issue.code === "unrecognized_keys" ? unknownKeysMessage(issue.keys, valid) : undefined,
  })
}

/** The input schema a registrar advertises for a raw shape under its strictness setting. */
export function registrarInputSchema(
  shape: ZodRawShape | undefined,
  strict: boolean,
): z.ZodObject<ZodRawShape> | undefined {
  if (strict) return strictInputSchema(shape ?? {})
  return shape ? z.object(shape) : undefined
}
