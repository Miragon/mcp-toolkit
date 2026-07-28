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
      props: z
        .record(z.string(), z.unknown())
        .optional()
        .describe(
          "Optional per-instance props passed to the widget at render time. Lets the same widget appear multiple times in one view with different scoping (e.g. `{ processDefinitionKey: 'miraveloLeasing' }` for a per-process dashboard tab).",
        ),
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

/**
 * Upper bound on how many times the string branch of
 * {@link layoutInputSchema} re-parses a JSON string whose parse result is
 * again a string. Real-world traffic needs two (see below); three leaves one
 * level of headroom while still rejecting absurd nesting depths.
 */
const MAX_STRING_UNWRAP_DEPTH = 3

/**
 * Tool-input variant of {@link layoutSchema} for `render-view` /
 * `refresh-view`: the three layout forms plus a JSON-string branch.
 *
 * Why: as a union, `layout` surfaces on the wire as a top-level `anyOf`
 * WITHOUT its own `type` field. Some MCP hosts (observed with claude.ai)
 * react to such properties by sending the argument as a JSON-encoded STRING —
 * which the plain union rejects, failing the whole call. The string branch
 * parses that form and pipes it through {@link layoutSchema}, so stringified
 * calls validate exactly like the object form. The three object branches are
 * reused from {@link layoutSchema} unchanged.
 *
 * The parse is a bounded unwrap loop, not a single `JSON.parse`: observed
 * claude.ai traffic delivers the layout DOUBLE-encoded — the model writes the
 * layout as a JSON string (because this schema advertises the string branch),
 * and the host layer then stringifies that value once more when serializing
 * the arguments. A single parse would yield a string again and fail the
 * union. The loop re-parses while the result is still a string, capped at
 * {@link MAX_STRING_UNWRAP_DEPTH} iterations as a guard against absurd
 * nesting; anything still a string after the cap fails the piped
 * {@link layoutSchema} like any other non-layout value.
 */
export const layoutInputSchema = z
  .union([
    ...layoutSchema.def.options,
    z
      .string()
      .transform((value, ctx): unknown => {
        let parsed: unknown = value
        for (
          let depth = 0;
          depth < MAX_STRING_UNWRAP_DEPTH && typeof parsed === "string";
          depth++
        ) {
          try {
            parsed = JSON.parse(parsed)
          } catch {
            ctx.addIssue({
              code: "custom",
              message: "layout was sent as a string but is not valid JSON",
            })
            return z.NEVER
          }
        }
        return parsed
      })
      .pipe(layoutSchema)
      .describe(
        "Layout as a JSON-encoded string (some hosts serialize complex parameters this way); parsed and validated like the object form.",
      ),
  ])
  .describe(
    "Widget layout: flat rows, { rows }, or { tabs } — or the same as a JSON-encoded string",
  )
