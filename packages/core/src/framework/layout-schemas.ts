import { z } from "zod"

/**
 * Zod schemas for the layout shape passed to `render-view` / `refresh-view`.
 *
 * Kept next to the `LayoutConfig` TypeScript types (see `./layout-types.ts`) so
 * the runtime validation and the static type of `LayoutConfig` stay in sync.
 * The framework-tool registrar (`../tools/register-framework-tools.ts`) plugs
 * these schemas into the mcp-use tool definitions.
 */

export const rowSchema = z.object({
  row: z.array(
    z.object({
      widget: z.string().describe("Widget ID from the framework manifest. Must be registered."),
      span: z.number().optional().describe("Grid columns (1-12)"),
    }),
  ),
})

export const layoutSchema = z
  .union([
    z.array(rowSchema).describe("Flat rows (legacy form)"),
    z.object({ rows: z.array(rowSchema) }).describe("Explicit rows wrapper"),
    z
      .object({
        tabs: z.array(
          z.object({
            label: z.string().describe("Tab label"),
            rows: z.array(rowSchema),
          }),
        ),
      })
      .describe("Tabs — widgets grouped in tabs"),
  ])
  .describe("Widget layout: flat rows, { rows }, or { tabs }")
