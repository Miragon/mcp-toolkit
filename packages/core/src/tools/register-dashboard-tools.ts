import { type MCPServer } from "mcp-use"
import { z } from "zod"
import { resolveCaller } from "../auth/caller.js"
import { errorResult, objectResult } from "./tool-results.js"
import {
  assertDashboardWritable,
  DashboardOwnershipError,
  DashboardUnreadableError,
  isDashboardOwnedBy,
  type DashboardRecord,
  type DashboardStore,
  type DashboardSummary,
} from "./dashboard-store.js"
import { collectLayoutWidgets } from "../framework/view-builders.js"
import { layoutSchema } from "../framework/layout-schemas.js"
import type { WidgetRegistry } from "../registry/widget-registry.js"

export interface RegisterDashboardToolsOptions {
  store: DashboardStore
  /**
   * Optional widget registry used by `save-dashboard` to warn (never reject)
   * when a layout references widget ids the server doesn't know about —
   * usually a typo, surfaced as a non-fatal warning so a save is never
   * blocked on a cosmetic mistake. Omit to skip the check entirely.
   */
  widgetRegistry?: WidgetRegistry
  /**
   * Refuse every dashboard call that resolves no caller id — even one that
   * carries no `ctx.auth` at all — instead of serving it in global scope.
   * `createFrameworkApp` sets this whenever an `oauth` provider is configured.
   * A call that DOES carry `ctx.auth` is held to it regardless: an
   * authenticated caller without an id is never widened to global scope.
   * Defaults to `false`.
   */
  requireCallerIdentity?: boolean
}

const stepRefSchema = z.object({
  id: z.string().describe("Context key under which the step's result is stored, e.g. 'invoice'."),
  step: z.string().describe("Registered step id, e.g. 'lexoffice:load-invoice'."),
  optional: z
    .boolean()
    .optional()
    .describe("If true, a failure of this step skips it instead of failing the whole view."),
})

const saveSchema = z.object({
  id: z
    .string()
    .optional()
    .describe("Existing dashboard id to update. Omit to create a new record."),
  name: z.string().describe("Human-readable dashboard name shown in lists."),
  description: z.string().optional().describe("Optional free-text summary shown in lists."),
  keys: z
    .record(z.string(), z.unknown())
    .optional()
    .describe(
      "Keys the saved view passes to render-view on load, e.g. { 'orders:customerId': '…' }.",
    ),
  steps: z
    .array(stepRefSchema)
    .optional()
    .describe("Pipeline steps the saved view re-runs on load, same shape as render-view's steps."),
  layout: layoutSchema,
  title: z.string().optional().describe("View title rendered above the widget grid."),
})

const idSchema = z.object({
  id: z.string().describe("Dashboard id as returned by `save-dashboard` or `list-dashboards`."),
})

/** The store filter a dashboard call runs under; `userId: undefined` is global scope. */
interface DashboardScope {
  userId: string | undefined
}

/**
 * Whose dashboards a call may touch: `{ userId: undefined }` is global scope
 * (a server without OAuth), `{ userId }` is that caller's records only, and
 * `undefined` means refuse — the call is authenticated (or OAuth is
 * required) but no caller id resolves, and falling back to global scope would
 * hand it every user's dashboards.
 */
function dashboardScope(ctx: unknown, requireCallerIdentity: boolean): DashboardScope | undefined {
  const caller = resolveCaller(ctx)
  if (caller?.userId) return { userId: caller.userId }
  if (caller === undefined && !requireCallerIdentity) return { userId: undefined }
  return undefined
}

const NO_IDENTITY_MESSAGE =
  "Access denied: this request carries no caller identity (the OAuth provider mapped no user id and the token has no `sub`). Dashboards are per-user, so they cannot be read or written without one."

/**
 * Defence in depth for custom stores with a laxer ownership rule (the 2.5
 * contract handed owner-less records to every caller): the record `get`
 * returns, but only if it is the caller's — {@link isDashboardOwnedBy}, so
 * global scope passes everything through. A store that already follows the
 * rule loses nothing but the extra read.
 */
async function ownRecord(
  store: DashboardStore,
  id: string,
  scope: DashboardScope,
): Promise<DashboardRecord | undefined> {
  const record = await store.get(id, scope)
  return record && isDashboardOwnedBy(record.userId, scope.userId) ? record : undefined
}

/**
 * Keep only the identified caller's own summaries. A summary that names its
 * owner is decided on the spot; one that doesn't (a store on the 2.5 summary
 * shape) is verified through `get`, and an unreadable one that cannot be
 * attributed that way is dropped rather than listed.
 */
async function ownSummaries(
  store: DashboardStore,
  items: DashboardSummary[],
  userId: string,
): Promise<DashboardSummary[]> {
  const isOwn = async (item: DashboardSummary): Promise<boolean> => {
    if (item.userId !== undefined) return item.userId === userId
    try {
      return (await ownRecord(store, item.id, { userId })) !== undefined
    } catch (err) {
      if (err instanceof DashboardUnreadableError) return false
      throw err
    }
  }
  const verdicts = await Promise.all(items.map(isOwn))
  return items.filter((_item, index) => verdicts[index])
}

/** Store refusals that reach the caller as a tool error rather than a crash. */
function refusalResult(err: unknown) {
  if (err instanceof DashboardOwnershipError || err instanceof DashboardUnreadableError) {
    return errorResult(err.message)
  }
  throw err
}

/**
 * Registers `save-dashboard`, `list-dashboards`, `load-dashboard`, and
 * `delete-dashboard`. The tools are thin CRUD wrappers around the injected
 * `DashboardStore`; the caller's scope is decided here via
 * {@link resolveCaller} (both mcp-use 2 `ctx.auth` shapes; `user.id`, then
 * `user.userId`, then the token's `sub`) and handed to the store as its
 * `userId` filter. An authenticated call that resolves no id is refused —
 * never served in global scope.
 *
 * `load-dashboard` returns the full record as JSON in `content[0].text`
 * (mirrored into `structuredContent`) so the model itself receives the
 * bundle — `structuredContent` alone is "not added to model context" per
 * MCP. The `{ keys, steps, layout, title }` fields can be piped straight
 * into `render-view` to re-render the saved dashboard.
 *
 * Registered by `createFrameworkApp` only when `app.builder` is `true` —
 * dashboard persistence is part of the opt-in visual builder platform
 * (lean by default). With the builder off, none of these tools exist and
 * the `app.dashboardStore` option has no effect.
 */
export function registerDashboardTools(
  server: MCPServer,
  options: RegisterDashboardToolsOptions,
): void {
  const { store, widgetRegistry } = options
  const requireCallerIdentity = options.requireCallerIdentity ?? false

  server.tool(
    {
      name: "save-dashboard",
      title: "Save Dashboard",
      description:
        "Persists a dashboard (render-view input bundle + name). Pass an existing `id` to update, omit to create. The builder UI's Save button invokes this tool.",
      inputSchema: saveSchema,
    },
    async (params, ctx) => {
      const scope = dashboardScope(ctx, requireCallerIdentity)
      if (!scope) return errorResult(NO_IDENTITY_MESSAGE)

      // Warn (never reject) on unknown widget ids — usually a typo. A save is
      // deliberately never blocked on a cosmetic layout mistake; the unknown
      // ids surface in the text summary so the user can spot and fix it.
      const unknownWidgets = widgetRegistry
        ? [...new Set(collectLayoutWidgets(params.layout))].filter((id) => !widgetRegistry.get(id))
        : []

      let record: DashboardRecord
      try {
        if (scope.userId !== undefined && params.id !== undefined) {
          // Defence in depth: a lax custom store's own save might let the
          // caller overwrite (and so claim) a record it does not own.
          const existing = await store.get(params.id, scope)
          if (existing) assertDashboardWritable(existing, scope.userId)
        }
        record = await store.save({
          id: params.id,
          name: params.name,
          description: params.description,
          userId: scope.userId,
          keys: params.keys,
          steps: params.steps,
          layout: params.layout,
          title: params.title,
        })
      } catch (err) {
        return refusalResult(err)
      }
      const summaryLines = [
        `Saved dashboard "${record.name}" (${record.id}).`,
        unknownWidgets.length > 0
          ? `Warning: layout references widget ids not registered on this server: ${unknownWidgets.join(", ")}. They will not render — check for typos or register the widgets.`
          : "",
      ].filter(Boolean)
      return {
        content: [{ type: "text" as const, text: summaryLines.join("\n") }],
        structuredContent: {
          id: record.id,
          name: record.name,
          createdAt: record.createdAt,
          updatedAt: record.updatedAt,
          ...(unknownWidgets.length > 0 ? { unknownWidgets } : {}),
        },
      }
    },
  )

  server.tool(
    {
      name: "list-dashboards",
      title: "List Dashboards",
      description:
        "Returns the dashboards visible to the caller (scoped by userId when auth is enabled). Metadata only — fetch a full record via `load-dashboard`.",
      annotations: { readOnlyHint: true },
    },
    async (_params, ctx) => {
      const scope = dashboardScope(ctx, requireCallerIdentity)
      if (!scope) return errorResult(NO_IDENTITY_MESSAGE)
      const items = await store.list({ userId: scope.userId })
      return objectResult({
        items: scope.userId === undefined ? items : await ownSummaries(store, items, scope.userId),
      })
    },
  )

  server.tool(
    {
      name: "load-dashboard",
      title: "Load Dashboard",
      description:
        "Returns the full dashboard bundle. The returned `{ keys, steps, layout, title }` fields can be handed straight to `render-view`.",
      inputSchema: idSchema,
      annotations: { readOnlyHint: true },
    },
    async ({ id }, ctx) => {
      const scope = dashboardScope(ctx, requireCallerIdentity)
      if (!scope) return errorResult(NO_IDENTITY_MESSAGE)
      let record: DashboardRecord | undefined
      try {
        record = await ownRecord(store, id, scope)
      } catch (err) {
        return refusalResult(err)
      }
      if (!record) {
        return {
          content: [{ type: "text" as const, text: `Dashboard "${id}" not found.` }],
          isError: true,
        }
      }
      // Validate the persisted layout before handing it back: a corrupted
      // store file could otherwise feed a malformed layout straight into
      // `render-view` (and the model). Surface a clear error instead of
      // silently forwarding garbage.
      const parsed = layoutSchema.safeParse(record.layout)
      if (!parsed.success) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Dashboard "${id}" has an invalid layout and cannot be loaded: ${parsed.error.issues
                .map((issue) => `${issue.path.join(".") || "<root>"}: ${issue.message}`)
                .join("; ")}`,
            },
          ],
          isError: true,
        }
      }
      return objectResult(record as unknown as Record<string, unknown>)
    },
  )

  server.tool(
    {
      name: "delete-dashboard",
      title: "Delete Dashboard",
      description: "Permanently removes a dashboard by id.",
      inputSchema: idSchema,
    },
    async ({ id }, ctx) => {
      const scope = dashboardScope(ctx, requireCallerIdentity)
      if (!scope) return errorResult(NO_IDENTITY_MESSAGE)
      let deleted: boolean
      try {
        // Defence in depth: never let a lax custom store delete a record the
        // identified caller does not own.
        const deletable = scope.userId === undefined || (await ownRecord(store, id, scope))
        deleted = deletable ? await store.delete(id, scope) : false
      } catch (err) {
        return refusalResult(err)
      }
      return {
        content: [
          {
            type: "text" as const,
            text: deleted ? `Deleted dashboard "${id}"` : `Dashboard "${id}" not found.`,
          },
        ],
        structuredContent: { deleted },
        isError: !deleted,
      }
    },
  )
}
