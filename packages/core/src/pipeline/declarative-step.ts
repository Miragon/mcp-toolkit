import type { DeclarativeStep } from "@miragon/mcp-toolkit-proxy-contract"
import type { PipelineStepDefinition } from "../types/step.js"

/**
 * `appConfig` shape an upstream-synthesised AppPlugin exposes to its
 * declarative steps. `buildProxyAppConfigs` injects `callTool` at boot;
 * the pipeline executor rebinds it per request.
 */
export interface DeclarativeAppConfig {
  callTool?: (name: string, args: unknown) => Promise<unknown>
}

/**
 * Reads a dot-separated path out of an arbitrary value. Traverses plain
 * objects and array indices; bails with `undefined` on the first missing
 * segment, `null`, or non-indexable intermediate.
 *
 * Used to resolve `inputMapping` / `outputMapping` paths which look like
 * `"keys.items-ui:itemId"` or `"structuredContent.item"`. Segments are
 * compared with bracket access, so namespaced keys (`items-ui:itemId`)
 * resolve as a single property lookup.
 */
export function dotPath(root: unknown, path: string): unknown {
  if (!path) return root
  const segments = path.split(".")
  let cursor: unknown = root
  for (const segment of segments) {
    if (cursor === null || cursor === undefined) return undefined
    if (typeof cursor !== "object") return undefined
    cursor = (cursor as Record<string, unknown>)[segment]
  }
  return cursor
}

/**
 * Compiles a `DeclarativeStep` from a module manifest into the toolkit's
 * `PipelineStepDefinition` shape. The returned step:
 *
 * - Resolves each `inputMapping` entry against `{ keys, steps }` of the
 *   live pipeline context via {@link dotPath}.
 * - Invokes `appConfig.callTool(step.tool, args)`. The executor pre-binds
 *   `callTool` to the originating module's upstream proxy (via
 *   `buildProxyAppConfigs` + `pipeline-executor.bindAppConfig`), so
 *   cross-module tool calls are structurally impossible — a step declared
 *   by module A can only dispatch against upstream A.
 * - Reads each `outputMapping` entry against the tool's raw response and
 *   writes the value into `keys` using the namespaced produced key.
 *
 * `moduleId` is recorded as `_app` on the step output so observability
 * tools can attribute every pipeline step to its contributing module.
 */
export function buildStepFromDeclaration(
  step: DeclarativeStep,
  moduleId: string,
): PipelineStepDefinition<DeclarativeAppConfig> {
  return {
    id: step.id,
    dataType: step.dataType,
    requires: [...step.requires],
    produces: [...step.produces],
    async execute(context, appConfig) {
      if (typeof appConfig?.callTool !== "function") {
        throw new Error(
          `declarative step "${step.id}" has no callTool bound — module "${moduleId}" is not wired to an upstream proxy`,
        )
      }

      const mappingRoot = { keys: context.keys, steps: context.steps }
      const args: Record<string, unknown> = {}
      for (const [argName, path] of Object.entries(step.inputMapping)) {
        args[argName] = dotPath(mappingRoot, path)
      }

      const response = await appConfig.callTool(step.tool, args)

      const keys: Record<string, unknown> = {}
      for (const [producedKey, path] of Object.entries(step.outputMapping)) {
        keys[producedKey] = dotPath(response, path)
      }

      return {
        data: response,
        keys,
        _app: moduleId,
        _step: step.id,
      }
    },
  }
}
