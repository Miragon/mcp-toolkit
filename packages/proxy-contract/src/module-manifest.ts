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
 * Current version of the module-manifest contract. Bumped whenever a change
 * to {@link ModuleManifestSchema} is not understood by older hosts. A host
 * skips any manifest whose `schemaVersion` exceeds the version it was built
 * against (fail-soft), so a newer upstream can advertise additional fields
 * without bricking an older host.
 *
 * Version history:
 * - `2` — adds host-widget references ({@link HostWidgetRefSchema}, the
 *   `hostWidget` field) and extended runtime requirements
 *   (`runtime.mcpUseReact` / `runtime.toolkitUi` / `runtime.reactQuery`).
 *   Manifests using either feature MUST declare `schemaVersion: 2` (enforced
 *   by the schema) so v1 hosts skip them cleanly at their version gate
 *   instead of half-parsing.
 * - `1` — initial versioned contract: bundle widgets + declarative steps.
 */
export const MODULE_MANIFEST_SCHEMA_VERSION = 2 as const

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
   * `"^19.0.0"`.
   */
  react: z.string().min(1),
  // The three optional keys below are semver ranges for shared runtimes
  // beyond React. Declaring one means the module's bundles import that
  // library as an external and the host must expose it (import map +
  // globalThis shim). A host that does not expose a required runtime skips
  // the module (fail-soft). Requires `schemaVersion: 2`.
  /** The `mcp-use/react` entry, versioned by the `mcp-use` package. */
  mcpUseReact: z.string().min(1).optional(),
  /** `@miragon/mcp-toolkit-ui` (all subpaths share one version). */
  toolkitUi: z.string().min(1).optional(),
  /** `@tanstack/react-query`. */
  reactQuery: z.string().min(1).optional(),
})

export type RuntimeRequirement = z.infer<typeof RuntimeRequirementSchema>

/**
 * A declarative pipeline step. Reduces to a single upstream tool call with
 * input/output key mappings, no host-side JS. The executor
 * (`buildStepFromDeclaration` in `@miragon/mcp-toolkit-core`) binds each step
 * to its originating module's `callTool` closure at registration time — a
 * step from module A can only invoke tools on upstream A.
 */
export const DeclarativeStepSchema = z
  .object({
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
  .superRefine((step, ctx) => {
    // The mappings are stringly-typed (`z.record(string, string)`), so a typo
    // would otherwise pass schema validation and surface only as a silently
    // empty widget at render time. These checks turn the common mistakes into
    // a discovery-time schema error instead.

    // Every `outputMapping` KEY is a key the step claims to `produce`. The
    // executor writes `keys[<outputMapping-key>] = dotPath(response, <path>)`,
    // so a key absent from `produces` is dead: the pipeline validator can't
    // see it, no downstream `requires` can depend on it, and the contract
    // (`produces`) lies about what the step emits.
    const produced = new Set(step.produces)
    for (const producedKey of Object.keys(step.outputMapping)) {
      if (!produced.has(producedKey)) {
        ctx.addIssue({
          code: "custom",
          path: ["outputMapping", producedKey],
          message: `outputMapping key "${producedKey}" is not declared in produces [${step.produces.join(", ")}]`,
        })
      }
    }

    // A blank dot-path (e.g. a `""` left by templating) is almost always a
    // mistake: on the input side it passes the whole `{ keys, steps }` root as
    // a tool argument; on the output side it binds the entire raw tool response
    // to a produced key. Reject both so the author fixes the path.
    for (const [argName, path] of Object.entries(step.inputMapping)) {
      if (path.trim() === "") {
        ctx.addIssue({
          code: "custom",
          path: ["inputMapping", argName],
          message: `inputMapping for argument "${argName}" has an empty dot-path`,
        })
      }
    }
    for (const [producedKey, path] of Object.entries(step.outputMapping)) {
      if (path.trim() === "") {
        ctx.addIssue({
          code: "custom",
          path: ["outputMapping", producedKey],
          message: `outputMapping for key "${producedKey}" has an empty dot-path`,
        })
      }
    }
  })

export type DeclarativeStep = z.infer<typeof DeclarativeStepSchema>

/**
 * Layout size hint mirrored from `@miragon/mcp-toolkit-core`'s `WidgetSize`.
 * Duplicated here so the manifest contract stays standalone — the host maps
 * this string straight onto `WidgetDefinition.size` when synthesising.
 */
export const WidgetSizeSchema = z.enum(["quarter", "third", "half", "full", "header"])

export type WidgetSizeHint = z.infer<typeof WidgetSizeSchema>

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
  /** Mutually exclusive with `bundle` — reserved by {@link HostWidgetRefSchema}. */
  hostWidget: z.never().optional(),
  /**
   * Optional layout size hint for the widget. Defaults to `"full"` when
   * omitted — matches the prior (size-less) contract, so upstreams that
   * haven't set it still register with a sensible default.
   */
  size: WidgetSizeSchema.optional(),
  /**
   * Optional JSON Schema describing per-instance props the widget accepts
   * via the layout cell's `props` field. Mirrors `WidgetDefinition.propsSchema`
   * from `@miragon/mcp-toolkit-core` and is surfaced verbatim in the host's
   * `get-framework-manifest` so an LLM can construct scoped views without
   * guessing prop names.
   */
  propsSchema: z.record(z.string(), z.unknown()).optional(),
})

export type RemoteWidget = z.infer<typeof RemoteWidgetSchema>

/**
 * A widget entry that references an EXISTING host-registered widget id instead
 * of shipping a bundle. The host synthesizes an alias: layout cells referencing
 * this module-namespaced `id` render the host widget identified by `hostWidget`,
 * with `props` merged under each cell's own `props` (the cell wins).
 * The target must be a host-bundled (local) widget; a target that is not
 * registered — or is itself upstream-hosted — causes the host to skip the
 * whole module (fail-soft). Requires `schemaVersion: 2`.
 */
export const HostWidgetRefSchema = z.object({
  id: namespacedId,
  /**
   * Keys the aliased widget expects in its `data` prop. The pipeline resolver
   * uses these to decide which steps must run before rendering the widget.
   */
  requires: z.array(namespacedId),
  /**
   * Host-registered widget id, e.g. `"shell:kpi-grid"`. Deliberately NOT
   * namespace-checked against this module — it names a widget of the host,
   * not one of the module's own.
   */
  hostWidget: z.string().min(1),
  /** Mutually exclusive with `hostWidget` — reserved by {@link RemoteWidgetSchema}. */
  bundle: z.never().optional(),
  /** Preset props merged under each layout cell's `props` (cell props win). */
  props: z.record(z.string(), z.unknown()).optional(),
  /**
   * Optional layout size hint for the widget. Defaults to `"full"` when
   * omitted, same as {@link RemoteWidgetSchema}.
   */
  size: WidgetSizeSchema.optional(),
  /**
   * Optional JSON Schema describing per-instance props the alias accepts via
   * the layout cell's `props` field. Surfaced verbatim in the host's
   * `get-framework-manifest`, exactly like a bundle widget's `propsSchema`.
   */
  propsSchema: z.record(z.string(), z.unknown()).optional(),
})

export type HostWidgetRef = z.infer<typeof HostWidgetRefSchema>

/** Either widget flavour a manifest may carry. */
export const ManifestWidgetSchema = z.union([RemoteWidgetSchema, HostWidgetRefSchema])

export type ManifestWidget = z.infer<typeof ManifestWidgetSchema>

/** Narrow a manifest widget entry to the host-reference variant. */
export function isHostWidgetRef(widget: ManifestWidget): widget is HostWidgetRef {
  return typeof (widget as HostWidgetRef).hostWidget === "string"
}

/**
 * The full manifest an upstream returns from `get-module-manifest`. Every
 * widget/step ID is validated to start with `<moduleId>:` so composition
 * across multiple upstreams cannot produce ID collisions.
 */
export const ModuleManifestSchema = z
  .object({
    /**
     * Version of the manifest contract this payload conforms to. Optional and
     * defaulting to `1` so manifests written against the pre-versioning
     * contract stay valid. A host compares this against
     * {@link MODULE_MANIFEST_SCHEMA_VERSION} and skips manifests from the
     * future rather than mis-parsing fields it doesn't know about.
     */
    schemaVersion: z.number().int().min(1).optional().default(1),
    moduleId: z.string().regex(MODULE_ID_PATTERN),
    runtime: RuntimeRequirementSchema,
    steps: z.array(DeclarativeStepSchema),
    widgets: z.array(ManifestWidgetSchema),
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
    // v2 feature gating: manifests using v2-only fields must declare
    // schemaVersion >= 2 so v1 hosts skip them cleanly at the version gate
    // instead of half-parsing (runtime extras would be silently stripped).
    const usesV2Runtime =
      manifest.runtime.mcpUseReact !== undefined ||
      manifest.runtime.toolkitUi !== undefined ||
      manifest.runtime.reactQuery !== undefined
    if (usesV2Runtime && manifest.schemaVersion < 2) {
      ctx.addIssue({
        code: "custom",
        path: ["schemaVersion"],
        message: "runtime.mcpUseReact/toolkitUi/reactQuery require schemaVersion >= 2",
      })
    }
    for (const [i, widget] of manifest.widgets.entries()) {
      if (isHostWidgetRef(widget) && manifest.schemaVersion < 2) {
        ctx.addIssue({
          code: "custom",
          path: ["widgets", i, "hostWidget"],
          message: "hostWidget references require schemaVersion >= 2",
        })
      }
    }
  })

export type ModuleManifest = z.infer<typeof ModuleManifestSchema>

/** Canonical tool name an upstream exposes to advertise its manifest. */
export const GET_MODULE_MANIFEST_TOOL = "get-module-manifest"
