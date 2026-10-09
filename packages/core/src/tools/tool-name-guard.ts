import type { MCPServer, ToolDefinition } from "mcp-use"

/**
 * What `installToolkit` does when a tool name is registered twice on its
 * server. `"warn"` (the 2.x default) logs both owners and lets mcp-use keep
 * the later registration, exactly as before; `"throw"` refuses the second
 * registration, failing the boot.
 */
export type DuplicateToolNamePolicy = "warn" | "throw"

/** Owner label of the tools `installToolkit` itself registers. */
export const FRAMEWORK_TOOL_OWNER = "the toolkit framework"

/** Owner label of tools registered outside any toolkit-run hook. */
export const APPLICATION_TOOL_OWNER = "application code"

/** Owner label of the tools a module's `registerTools` / `registerWidgetTools` hook registers. */
export function moduleToolOwner(moduleName: string): string {
  return `module "${moduleName}"`
}

/** The diagnostic for a duplicate tool name, naming the tool and both owners. */
export function duplicateToolNameMessage(
  name: string,
  existingOwner: string,
  newOwner: string,
  policy: DuplicateToolNamePolicy,
): string {
  const head = `Duplicate tool name "${name}": already registered by ${existingOwner}, registered again by ${newOwner}.`
  if (policy === "throw") return `${head} mcp-use keeps one tool per name — rename one of them.`
  return (
    `[mcp-toolkit] ${head} mcp-use keeps only the last registration, so the tool from ` +
    `${newOwner} replaces the one from ${existingOwner} — rename one of them ` +
    `(installToolkit's duplicateToolNames: "throw" makes this a boot error).`
  )
}

interface ToolNameGuard {
  policy: DuplicateToolNamePolicy
  owners: Map<string, string>
  scopes: string[]
}

type ToolRegistration = (definition: ToolDefinition, callback: never) => unknown

const guards = new WeakMap<object, ToolNameGuard>()

/**
 * Wrap `server.tool` so every registration is checked against the names
 * already taken on this server. mcp-use's own `tool()` is a plain map set
 * (last wins), so without this a module tool named like a framework tool —
 * or like another module's — silently disappears.
 *
 * The wrapper stays installed, so registrations made by application code
 * after `installToolkit` are guarded too. Tools registered on the server
 * BEFORE the guard was installed are invisible to it (mcp-use has no public
 * tool listing). Installing twice keeps one wrapper; `"throw"` wins.
 */
export function installToolNameGuard(server: MCPServer, policy: DuplicateToolNamePolicy): void {
  const existing = guards.get(server)
  if (existing) {
    if (policy === "throw") existing.policy = "throw"
    return
  }
  const guard: ToolNameGuard = { policy, owners: new Map(), scopes: [] }
  guards.set(server, guard)

  // `never` keeps the checked assignment sound under parameter
  // contravariance — the wrapper only forwards the callback.
  const original: ToolRegistration = server.tool.bind(server)
  const guarded: ToolRegistration = (definition, callback) => {
    const owner = guard.scopes.at(-1) ?? APPLICATION_TOOL_OWNER
    const previous = guard.owners.get(definition.name)
    if (previous !== undefined) {
      const message = duplicateToolNameMessage(definition.name, previous, owner, guard.policy)
      if (guard.policy === "throw") throw new Error(message)
      console.warn(message)
    }
    guard.owners.set(definition.name, owner)
    return original(definition, callback)
  }
  server.tool = guarded as typeof server.tool
}

/**
 * Run `register` with `owner` as the label for every tool it registers on
 * `server`. A no-op wrapper when the server has no guard (e.g.
 * `registerFrameworkTools` called on a server `installToolkit` never saw).
 */
export function withToolOwner<T>(server: object, owner: string, register: () => T): T {
  const guard = guards.get(server)
  if (!guard) return register()
  guard.scopes.push(owner)
  try {
    return register()
  } finally {
    guard.scopes.pop()
  }
}
