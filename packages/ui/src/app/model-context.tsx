import { createContext, useContext, useEffect, useId, type ReactNode } from "react"
import { ModelContext } from "mcp-use/react"
import { useHostBridgeOrNull } from "./host-bridge.js"

/**
 * The view's model context: what the model reads about the view on its next
 * turn (`ui/update-model-context`). The one module that builds on mcp-use's
 * native `ModelContext`, which throws outside a `bootstrapView` mount; every
 * other component reports through {@link HostModelContext} or
 * {@link useHostModelContext} (toolkit#176 K20).
 */

/**
 * `true` inside an mcp-use 2.x view — i.e. under a `McpUseHostBridgeProvider`,
 * which itself only renders under a `bootstrapView`-mounted tree. Components
 * that want to use `mcp-use/react` primitives (which throw outside a view)
 * branch on this instead of probing mcp-use internals. Exported for the
 * provider and for tests that render a view-scoped subtree.
 */
export const McpUseViewContext = createContext(false)

/** Whether the subtree runs inside an mcp-use view (see {@link McpUseViewContext}). */
export function useIsInsideMcpUseView(): boolean {
  return useContext(McpUseViewContext)
}

/**
 * Model-context reporting that works on every host — the host-portable
 * replacement for rendering `mcp-use/react`'s `ModelContext` directly.
 *
 * Inside an mcp-use view it renders the native `ModelContext`, which nests:
 * the lines of its children hang below its own in the one description the
 * host receives. Everywhere else — ChatGPT via `createChatGptHostBridge`, the
 * `WidgetFixtureHost` harness, standalone apps — the description flows
 * through the bridge's `setModelContext` instead (last-writer-wins; fine for
 * the single-widget mounts those hosts render).
 *
 * Widgets that self-fetch and report their own context (cockpit views like
 * `TasksBoard`) must use this instead of importing `ModelContext` from
 * `mcp-use/react` — the direct import crashes the widget in every non-view
 * mount, starting with the widget playground. Without `children` it reports
 * one line where it is rendered.
 */
export function HostModelContext({
  content,
  children,
}: {
  content: string
  children?: ReactNode
}): ReactNode {
  const insideView = useIsInsideMcpUseView()
  if (insideView) return <ModelContext content={content}>{children}</ModelContext>
  return <BridgeModelContext content={content}>{children}</BridgeModelContext>
}

function BridgeModelContext({ content, children }: { content: string; children?: ReactNode }) {
  const bridge = useHostBridgeOrNull()
  const setModelContext = bridge?.setModelContext
  useEffect(() => {
    setModelContext?.(content)
  }, [setModelContext, content])
  return children
}

/**
 * The view's ONE model-context channel: lines registered here render as
 * root-level native `ModelContext` nodes ({@link ModelContextLines}), the
 * tree `HostModelContext` nodes join too, so the host receives everything
 * the view reports in one description. `McpUseHostBridgeProvider` owns it.
 */
export interface ModelContextChannel {
  /** Set (`content`) or remove (`null`) the line registered under `id`. */
  set: (id: string, content: string | null) => void
}

export const ModelContextChannelContext = createContext<ModelContextChannel | null>(null)

/** `lines` with `id` set to `content` (or removed for `null`); the same map when nothing changes. */
export function withModelContextLine(
  lines: ReadonlyMap<string, string>,
  id: string,
  content: string | null,
): ReadonlyMap<string, string> {
  if (content === null ? !lines.has(id) : lines.get(id) === content) return lines
  const next = new Map(lines)
  if (content === null) next.delete(id)
  else next.set(id, content)
  return next
}

/** A line of model context, or `null` for a blank one (nothing to report). */
export function modelContextLine(content: string | null | undefined): string | null {
  return content?.trim() ? content : null
}

/** Renders the channel's lines as native `ModelContext` nodes (inside a view only). */
export function ModelContextLines({ lines }: { lines: ReadonlyMap<string, string> }): ReactNode {
  return [...lines].map(([id, content]) => <ModelContext key={id} content={content} />)
}

/**
 * Report one line of model context for as long as the calling component is
 * mounted: what the user is looking at, a filter, an error the user sees.
 * The channel helper for components with nothing to wrap
 * ({@link HostModelContext} is the wrapping form).
 *
 * Inside an mcp-use view the line joins the view's one model-context tree and
 * leaves it on unmount or when `content` turns blank. Elsewhere (the ChatGPT
 * bridge, the fixture harness, standalone apps) it goes through the bridge's
 * `setModelContext`, last writer wins.
 */
export function useHostModelContext(content: string | null | undefined): void {
  const channel = useContext(ModelContextChannelContext)
  const setModelContext = useHostBridgeOrNull()?.setModelContext
  const id = useId()
  const line = modelContextLine(content)
  useEffect(() => {
    if (channel) {
      channel.set(id, line)
      return () => channel.set(id, null)
    }
    if (line !== null) setModelContext?.(line)
    return undefined
  }, [channel, id, line, setModelContext])
}
