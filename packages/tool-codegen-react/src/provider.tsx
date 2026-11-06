import type { ToolCaller } from "@miragon/mcp-toolkit-tool-codegen-core"
import { createContext, useContext, useMemo, type ReactElement, type ReactNode } from "react"

/** Tells "no provider above" apart from "a provider without a caller yet" (`null`). */
const NO_PROVIDER = Symbol("no ToolCallerProvider")

/** The callers the providers above supply: one per named namespace, and one for the rest. */
interface Callers {
  readonly byNamespace: ReadonlyMap<string, ToolCaller | null>
  readonly fallback: ToolCaller | null | typeof NO_PROVIDER
}

const ToolCallerContext = createContext<Callers>({ byNamespace: new Map(), fallback: NO_PROVIDER })

export interface ToolCallerProviderProps {
  /**
   * The namespace whose hooks call tools with this caller: the codegen config's `name`, the
   * first argument of `useToolQuery` and `useToolMutation`. Without it, the caller serves every
   * namespace no provider above names.
   */
  namespace?: string
  /**
   * The function the hooks below call tools with. `null` or `undefined` while it is not ready yet
   * (a client still connecting, a widget host not attached): queries wait and mutations reject
   * with a `NoToolCallerError` until it arrives.
   */
  callTool: ToolCaller | null | undefined
  children: ReactNode
}

/**
 * Supplies the `ToolCaller` to `useToolQuery`, `useToolMutation` and the generated hooks. It does
 * not create a `QueryClient`: the app renders its own `QueryClientProvider` around it. Providers
 * nest: one with a `namespace` adds that server's caller to those above it.
 */
export function ToolCallerProvider({
  namespace,
  callTool,
  children,
}: ToolCallerProviderProps): ReactElement {
  const parent = useContext(ToolCallerContext)
  const caller = callTool ?? null
  const callers = useMemo<Callers>(
    () =>
      namespace === undefined
        ? { byNamespace: parent.byNamespace, fallback: caller }
        : {
            byNamespace: new Map(parent.byNamespace).set(namespace, caller),
            fallback: parent.fallback,
          },
    [parent, namespace, caller],
  )
  // `.Provider` rather than `<Context>` as a provider: React 18 knows only the former.
  return <ToolCallerContext.Provider value={callers}>{children}</ToolCallerContext.Provider>
}

/**
 * The `ToolCaller` for `namespace`: that of the nearest provider naming it, else that of the
 * nearest provider without a namespace; `null` while that provider has none yet. Throws when
 * neither is above: that is a wiring mistake, not a loading state.
 */
export function useToolCaller(namespace?: string): ToolCaller | null {
  const { byNamespace, fallback } = useContext(ToolCallerContext)
  if (namespace !== undefined && byNamespace.has(namespace)) {
    return byNamespace.get(namespace) ?? null
  }
  if (fallback === NO_PROVIDER) {
    const provider =
      namespace === undefined
        ? "a <ToolCallerProvider>"
        : `a <ToolCallerProvider namespace=${JSON.stringify(namespace)}> (or one without a namespace)`
    throw new Error(
      `useToolCaller, useToolQuery and useToolMutation need ${provider} above them: ` +
        "render it inside your QueryClientProvider and pass it the callTool function.",
    )
  }
  return fallback
}

/**
 * Brands a NoToolCallerError for `isNoToolCallerError`, which has to hold across copies of this
 * package, where `instanceof` fails. The registry key is a contract between versions.
 */
const NO_TOOL_CALLER_ERROR = Symbol.for("@miragon/mcp-toolkit-tool-codegen-react/NoToolCallerError")

/** A tool was called while the `ToolCallerProvider` had no caller yet. */
export class NoToolCallerError extends Error {
  override readonly name = "NoToolCallerError"
  readonly toolName: string

  constructor(toolName: string) {
    super(`Cannot call tool "${toolName}": the ToolCallerProvider has no callTool yet`)
    this.toolName = toolName
    Object.defineProperty(this, NO_TOOL_CALLER_ERROR, { value: true })
  }
}

/** True for a NoToolCallerError, also one thrown by another copy of this package. */
export function isNoToolCallerError(error: unknown): error is NoToolCallerError {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { [NO_TOOL_CALLER_ERROR]?: unknown })[NO_TOOL_CALLER_ERROR] === true
  )
}
