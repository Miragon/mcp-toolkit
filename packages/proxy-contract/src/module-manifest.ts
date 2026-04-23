import { z } from "zod"

/**
 * Contract for upstream-hosted MCP modules. An upstream server that wants to
 * contribute widgets + declarative pipeline steps to a host exposes an MCP
 * tool `get-module-manifest` returning this shape. The host discovers the
 * manifest at boot, merges its widgets/steps into its registries, and routes
 * widget bundle fetches + declarative tool calls back to the originating
 * upstream.
 *
 * See `docs/plans/upstream-hosted-modules.md` for the full design.
 */

/**
 * Module IDs are used as a namespace prefix on every widget ID, step ID,
 * dataType, and produced key (`<moduleId>:<local>`). They must be
 * URL-safe, MCP-tool-name-safe, and match the same character class as proxy
 * names so the two spaces remain interoperable.
 */
export const MODULE_ID_PATTERN = /^[a-z][a-z0-9-]*$/

/**
 * Declarative step `id`, widget `id`, step `dataType`, and every entry in
 * `produces`/`requires` must be `<namespace>:<local>`. The namespace portion
 * matches `MODULE_ID_PATTERN` (lowercase kebab-case). The local portion is
 * intentionally permissive — it allows camelCase (`itemId`), kebab-case
 * (`item-card`), and dotted keys (`order.line.id`) so modules can pick
 * whichever convention suits their existing code.
 */
export const NAMESPACED_ID_PATTERN = /^[a-z][a-z0-9-]*:[A-Za-z0-9][A-Za-z0-9._-]*$/

const namespacedId = z.string().regex(NAMESPACED_ID_PATTERN, "must be `<moduleId>:<local-id>`")

/**
 * What shared runtime libraries the module was built against. Host validates
 * at discovery time that its own runtime satisfies every entry. A mismatch
 * causes the host to skip the module with a logged error (fail-soft), rather
 * than crashing the whole boot — other upstreams' modules still load.
 */
export const RuntimeRequirementSchema = z.object({
  /**
   * Semver range the module's widget bundles expect for `react`. Example:
   * `"^19.0.0"`. Phase 2 introduces range-parsing + version-checking; for now
   * the contract just requires a non-empty string.
   */
  react: z.string().min(1),
})

export type RuntimeRequirement = z.infer<typeof RuntimeRequirementSchema>

/**
 * A declarative pipeline step. Reduces to a single upstream tool call with
 * input/output key mappings, no host-side JS. The executor lives in
 * `@miragon/mcp-toolkit-core` (Phase 2) and binds each step to its
 * originating module's `callTool` closure at registration time — a step
 * from module A can only invoke tools on upstream A.
 */
export const DeclarativeStepSchema = z.object({
  id: namespacedId,
  dataType: namespacedId,
  requires: z.array(namespacedId),
  produces: z.array(namespacedId).min(1),
  /**
   * Upstream tool name the step invokes. Unprefixed — the host prepends the
   * originating proxy's name when routing (`items_get-item`, etc.).
   */
  tool: z.string().min(1),
  /**
   * Maps tool argument names to dot-paths into the pipeline context.
   * Example: `{ id: "keys.items-ui:itemId" }` reads `ctx.keys["items-ui:itemId"]`
   * and passes it as the tool's `id` argument.
   */
  inputMapping: z.record(z.string(), z.string()),
  /**
   * Maps produced key names to dot-paths into the tool call's response.
   * Example: `{ "items-ui:item": "result" }` assigns the whole response's
   * `result` field to `ctx.keys["items-ui:item"]` after a successful call.
   */
  outputMapping: z.record(z.string(), z.string()),
})

export type DeclarativeStep = z.infer<typeof DeclarativeStepSchema>

/**
 * A widget served as an MCP resource by the upstream. The host's widget
 * loader fetches the bundle URI at render time via the originating upstream's
 * proxy, dynamically `import()`s the ESM, and asserts React-major
 * compatibility before mounting.
 */
export const RemoteWidgetSchema = z.object({
  id: namespacedId,
  /**
   * Keys the widget expects in its `data` prop. The pipeline resolver uses
   * these to decide which steps must run before rendering the widget.
   */
  requires: z.array(namespacedId),
  /**
   * MCP resource URI pointing at the widget's compiled JS bundle.
   * Typically `ui://<moduleId>/widgets/<name>.js`. The host reads it via
   * the upstream's MCP resource API.
   */
  bundle: z.string().min(1),
})

export type RemoteWidget = z.infer<typeof RemoteWidgetSchema>

/**
 * The full manifest an upstream returns from `get-module-manifest`. Every
 * widget/step ID is validated to start with `<moduleId>:` so composition
 * across multiple upstreams cannot produce ID collisions.
 */
export const ModuleManifestSchema = z
  .object({
    moduleId: z.string().regex(MODULE_ID_PATTERN),
    runtime: RuntimeRequirementSchema,
    steps: z.array(DeclarativeStepSchema),
    widgets: z.array(RemoteWidgetSchema),
  })
  .superRefine((manifest, ctx) => {
    const prefix = `${manifest.moduleId}:`
    const assertNamespaced = (value: string, path: (string | number)[]) => {
      if (!value.startsWith(prefix)) {
        ctx.addIssue({
          code: "custom",
          path,
          message: `"${value}" must start with module namespace "${prefix}"`,
        })
      }
    }
    for (const [i, step] of manifest.steps.entries()) {
      assertNamespaced(step.id, ["steps", i, "id"])
      assertNamespaced(step.dataType, ["steps", i, "dataType"])
      for (const [j, key] of step.produces.entries()) {
        assertNamespaced(key, ["steps", i, "produces", j])
      }
    }
    for (const [i, widget] of manifest.widgets.entries()) {
      assertNamespaced(widget.id, ["widgets", i, "id"])
    }
    const seenStepIds = new Set<string>()
    for (const [i, step] of manifest.steps.entries()) {
      if (seenStepIds.has(step.id)) {
        ctx.addIssue({
          code: "custom",
          path: ["steps", i, "id"],
          message: `duplicate step id "${step.id}"`,
        })
      }
      seenStepIds.add(step.id)
    }
    const seenWidgetIds = new Set<string>()
    for (const [i, widget] of manifest.widgets.entries()) {
      if (seenWidgetIds.has(widget.id)) {
        ctx.addIssue({
          code: "custom",
          path: ["widgets", i, "id"],
          message: `duplicate widget id "${widget.id}"`,
        })
      }
      seenWidgetIds.add(widget.id)
    }
  })

export type ModuleManifest = z.infer<typeof ModuleManifestSchema>

/** Canonical tool name an upstream exposes to advertise its manifest. */
export const GET_MODULE_MANIFEST_TOOL = "get-module-manifest"
