import { type MCPServer } from "mcp-use"
import { z } from "zod"
import { objectResult } from "./tool-results.js"
import type { DashboardStore } from "./dashboard-store.js"
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

function extractUserId(ctx: unknown): string | undefined {
  const user = (ctx as { auth?: { user?: { userId?: unknown } } } | undefined)?.auth?.user
  return typeof user?.userId === "string" ? user.userId : undefined
}

/**
 * Registers `save-dashboard`, `list-dashboards`, `load-dashboard`, and
 * `delete-dashboard`. The tools are thin CRUD wrappers around the injected
 * `DashboardStore`; auth scoping is applied here (never in the store) via
 * the standard `ctx.auth.user.userId` extraction.
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

  server.tool(
    {
      name: "save-dashboard",
      title: "Save Dashboard",
      description:
        "Persists a dashboard (render-view input bundle + name). Pass an existing `id` to update, omit to create. The builder UI's Save button invokes this tool.",
      inputSchema: saveSchema,
    },
    async (params, ctx) => {
      // Warn (never reject) on unknown widget ids — usually a typo. A save is
      // deliberately never blocked on a cosmetic layout mistake; the unknown
      // ids surface in the text summary so the user can spot and fix it.
      const unknownWidgets = widgetRegistry
        ? [...new Set(collectLayoutWidgets(params.layout))].filter((id) => !widgetRegistry.get(id))
        : []

      const record = await store.save({
        id: params.id,
        name: params.name,
        description: params.description,
        userId: extractUserId(ctx),
        keys: params.keys,
        steps: params.steps,
        layout: params.layout,
        title: params.title,
      })
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
      const items = await store.list({ userId: extractUserId(ctx) })
      return objectResult({ items })
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
      const record = await store.get(id, { userId: extractUserId(ctx) })
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
      const deleted = await store.delete(id, { userId: extractUserId(ctx) })
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
