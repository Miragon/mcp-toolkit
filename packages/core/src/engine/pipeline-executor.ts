import { resolveCaller } from "../auth/caller.js"
import type { PipelineContext } from "../types/context.js"
import type { PipelineConfig } from "../types/pipeline.js"
import type { StepRegistry } from "../registry/step-registry.js"

/**
 * Per-request context threaded into steps: who is calling. The executor hands
 * it to a user-scoped `callTool` closure on the step's `appConfig` (as its
 * hidden third argument) so step code stays synchronous and userId-free.
 * Build it from a tool handler's `ctx` with {@link resolvePipelineContext}.
 */
export interface PipelineExecutionContext {
  /**
   * The caller's id ({@link resolveCaller}). `undefined` for a request without
   * auth — and for an authenticated caller whose provider maps no id; tell the
   * two apart with {@link PipelineExecutionContext.authenticated}.
   */
  userId?: string
  /**
   * `true` when the request carried auth, even if no `userId` resolved from
   * it. An authenticated caller WITHOUT a `userId` is not anonymous: a closure
   * that scopes data per user must refuse it rather than fall back to its
   * global / anonymous scope. Absent for a request without auth (a server
   * without OAuth).
   */
  authenticated?: boolean
}

/**
 * The {@link PipelineExecutionContext} for a tool / resource / prompt `ctx`,
 * read through {@link resolveCaller} (both mcp-use 2 `ctx.auth` shapes) — what
 * render-view, refresh-view and the builder catalogue hand their pipeline.
 * Use it too when calling `renderView` / `getBuilderCatalogue` from your own
 * tool, instead of reading `ctx.auth` yourself.
 *
 * @example
 * ```ts
 * server.tool({ name: "my-view", … }, (args, ctx) =>
 *   renderView({ input: args, stepRegistry, ctx: resolvePipelineContext(ctx) }),
 * )
 * ```
 */
export function resolvePipelineContext(ctx: unknown): PipelineExecutionContext {
  const caller = resolveCaller(ctx)
  return caller === undefined ? {} : { userId: caller.userId, authenticated: true }
}

/**
 * If the step's appConfig contains a `callTool` function (a closure the
 * plugin injects via `AppPlugin.appConfig`, e.g. a typed `callTool` bound to
 * the module's own store or client), rewrap it so the step-facing call
 * signature is `(name, args)` while the underlying closure receives the
 * current {@link PipelineExecutionContext} (`{ userId, authenticated }`) via a
 * hidden 3rd argument — steps stay synchronous and userId-free while the
 * closure can still scope data per user.
 * All other keys pass through untouched.
 */
function bindAppConfig(appConfig: unknown, ctx: PipelineExecutionContext | undefined): unknown {
  if (!appConfig || typeof appConfig !== "object") return appConfig
  const cfg = appConfig as Record<string, unknown>
  const callTool = cfg.callTool
  if (typeof callTool !== "function") return appConfig
  const raw = callTool as (
    name: string,
    args: unknown,
    ctx?: PipelineExecutionContext,
  ) => Promise<unknown>
  return {
    ...cfg,
    callTool: (name: string, args: unknown) => raw(name, args, ctx),
  }
}

export interface ExecutePipelineOptions {
  config: PipelineConfig
  initialKeys: Record<string, unknown>
  registry: StepRegistry
  appConfigs?: Record<string, unknown>
  ctx?: PipelineExecutionContext
}

export async function executePipeline(options: ExecutePipelineOptions): Promise<PipelineContext> {
  const { config, initialKeys, registry, appConfigs, ctx } = options
  const context: PipelineContext = {
    steps: {},
    keys: { ...initialKeys },
    errors: [],
  }

  for (const ref of config.steps ?? []) {
    const stepDef = registry.get(ref.step)

    if (!stepDef) {
      if (ref.optional) continue
      context.errors.push({ stepId: ref.id, reason: `Step "${ref.step}" not registered` })
      continue
    }

    const missingKeys = stepDef.requires.filter((key) => !(key in context.keys))
    if (missingKeys.length > 0) {
      if (ref.optional) continue
      context.errors.push({
        stepId: ref.id,
        reason: `Missing required keys: ${missingKeys.join(", ")}`,
      })
      continue
    }

    try {
      const colon = ref.step.indexOf(":")
      const appName = colon >= 0 ? ref.step.slice(0, colon) : ref.step
      const rawConfig = appConfigs?.[appName] ?? {}
      const appConfig = bindAppConfig(rawConfig, ctx)
      const output = await stepDef.execute(context, appConfig)
      const result = { ...output, _dataType: stepDef.dataType }
      context.steps[ref.id] = result
      // Merge produced keys, but skip `undefined` values. The downstream
      // `requires` gate below tests `key in context.keys`, so writing an
      // `undefined` (e.g. an `outputMapping` dot-path that resolved to nothing
      // because the upstream tool returned an unexpected shape) would make the
      // key look "present" and let a dependent step run against missing data.
      // Dropping undefineds keeps the gate honest — the dependent step is
      // skipped (optional) or reported as missing-keys instead of silently
      // executing with `undefined` inputs.
      for (const [key, value] of Object.entries(result.keys)) {
        if (value !== undefined) context.keys[key] = value
      }
    } catch (err) {
      if (ref.optional) continue
      context.errors.push({
        stepId: ref.id,
        reason: err instanceof Error ? err.message : String(err),
      })
    }
  }

  return context
}
