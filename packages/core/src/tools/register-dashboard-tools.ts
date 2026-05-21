import { type MCPServer, object } from "mcp-use/server"
import { z } from "zod"
import type { DashboardStore } from "../framework/dashboard-store.js"
import { layoutSchema } from "../framework/layout-schemas.js"

export interface RegisterDashboardToolsOptions {
  store: DashboardStore
}

const stepRefSchema = z.object({
  id: z.string(),
  step: z.string(),
  optional: z.boolean().optional(),
})

const saveSchema = z.object({
  id: z
    .string()
    .optional()
    .describe("Existing dashboard id to update. Omit to create a new record."),
  name: z.string().describe("Human-readable dashboard name shown in lists."),
  description: z.string().optional(),
  keys: z.record(z.string(), z.unknown()).optional(),
  steps: z.array(stepRefSchema).optional(),
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
 * into `render-view` — the "aufrufbares Dashboard" loop the plan targets.
 */
export function registerDashboardTools(
  server: MCPServer,
  options: RegisterDashboardToolsOptions,
): void {
  const { store } = options

  server.tool(
    {
      name: "save-dashboard",
      title: "Save Dashboard",
      description:
        "Persists a dashboard (render-view input bundle + name). Pass an existing `id` to update, omit to create. The builder UI's Save button invokes this tool.",
      schema: saveSchema,
    },
    async (params, ctx) => {
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
      return object({
        id: record.id,
        name: record.name,
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
      })
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
      return object({ items })
    },
  )

  server.tool(
    {
      name: "load-dashboard",
      title: "Load Dashboard",
      description:
        "Returns the full dashboard bundle. The returned `{ keys, steps, layout, title }` fields can be handed straight to `render-view`.",
      schema: idSchema,
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
      return object(record as unknown as Record<string, unknown>)
    },
  )

  server.tool(
    {
      name: "delete-dashboard",
      title: "Delete Dashboard",
      description: "Permanently removes a dashboard by id.",
      schema: idSchema,
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
