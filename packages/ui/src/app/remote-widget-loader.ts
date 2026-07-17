import React from "react"
import type { WidgetComponent } from "./widget-renderer.js"
import { TOOLKIT_REACT_MAJOR } from "../index.js"

/**
 * Signature `McpAppView` consumes for lazy-loading remote widgets declared
 * in an upstream manifest. Implementations map a widget ID + MCP resource
 * URI to a concrete component to render.
 */
export type WidgetLoader = (id: string, uri: string) => Promise<WidgetComponent>

/**
 * Host-supplied bridge for reading a remote widget's compiled JS source.
 * The browser-side bundle can't call `resources/read` on an upstream
 * directly (the widget iframe only has MCP Apps `postMessage` +
 * `callTool`), so the app-bundle wires this to whatever transport is
 * available — typically a host tool that proxies to the upstream's
 * resource API, keyed by widget id + bundle URI so the host can route
 * the call to the right upstream without the browser having to know.
 */
export type FetchResourceText = (id: string, uri: string) => Promise<string>

export interface CreateRemoteWidgetLoaderOptions {
  fetchResource: FetchResourceText
  /**
   * Override the evaluator used to turn raw JS source into an ES module.
   * Production defaults to Blob URL + dynamic `import()`. Tests inject a
   * stub so the loader can be exercised outside a browser environment.
   */
  evaluateBundle?: (source: string) => Promise<RemoteWidgetModule>
  /**
   * Override the React major version the loader asserts against. Defaults
   * to `TOOLKIT_REACT_MAJOR`. Exposed for tests; consumers should not
   * pass this in production — the whole point of the lock is that it
   * matches the UI package's peer.
   */
  expectedReactMajor?: number
}

/**
 * Shape we expect an evaluated widget bundle to produce. `default` is the
 * component the loader hands back to `WidgetRenderer`. We deliberately
 * don't require anything else — bundle authors can export additional
 * named symbols without breaking loading.
 */
interface RemoteWidgetModule {
  default: WidgetComponent
}

/**
 * Builds a `WidgetLoader` that fetches a widget bundle's JS over MCP,
 * evaluates it as an ES module, and hands back the default export.
 *
 * **Runtime React assert.** The host and widget must agree on React. We
 * check the host's own `React.version` against `TOOLKIT_REACT_MAJOR` once
 * at loader-construction time. The upstream's manifest validator already
 * runs the same check against the manifest's declared `runtime.react`;
 * this second check defends against bundles whose build pipeline drifted
 * from what their manifest advertises — with an externalised React
 * resolved through the host's import map, the widget sees the same
 * `React` object as the host, so a host-side version check covers both.
 *
 * **Blob-URL evaluation.** The fetched source is wrapped in a Blob URL
 * and handed to a dynamic `import()`. This keeps module semantics (ES
 * exports, top-level `await`, tree-shaken React externals) without
 * invoking `eval`/`new Function` — both are blocked by typical CSP. The
 * Blob URL is revoked after the import resolves so we don't leak memory
 * across widget loads.
 */
export function createRemoteWidgetLoader(options: CreateRemoteWidgetLoaderOptions): WidgetLoader {
  const {
    fetchResource,
    evaluateBundle = evaluateViaBlobUrl,
    expectedReactMajor = TOOLKIT_REACT_MAJOR,
  } = options
  assertHostReactMajor(expectedReactMajor)

  return async function loadRemoteWidget(id, uri) {
    const source = await fetchResource(id, uri)
    let mod: RemoteWidgetModule
    try {
      mod = await evaluateBundle(source)
    } catch (err) {
      // The commonest evaluation failure is an unresolvable bare specifier:
      // the bundle externalised a shared runtime (mcp-use/react, the
      // toolkit-ui barrels, @tanstack/react-query) that the host page's
      // import map doesn't expose. Point straight at the fix instead of
      // leaving a bare "Failed to resolve module specifier" in the console.
      const reason = err instanceof Error ? err.message : String(err)
      throw new Error(
        `remote widget "${id}" bundle at ${uri} failed to evaluate: ${reason}. ` +
          `If the message names a bare module specifier, the host page's import map does not ` +
          `expose that shared runtime — see buildSharedRuntimeImportMap/exposeSharedRuntime in @miragon/mcp-toolkit-ui.`,
        { cause: err },
      )
    }
    if (typeof mod.default !== "function") {
      throw new Error(`remote widget "${id}" bundle at ${uri} has no default export component`)
    }
    return mod.default
  }
}

async function evaluateViaBlobUrl(source: string): Promise<RemoteWidgetModule> {
  const blobUrl = URL.createObjectURL(new Blob([source], { type: "text/javascript" }))
  try {
    return (await import(/* @vite-ignore */ blobUrl)) as RemoteWidgetModule
  } finally {
    URL.revokeObjectURL(blobUrl)
  }
}

function assertHostReactMajor(expectedMajor: number): void {
  const version = React.version
  const major = Number.parseInt(version.split(".")[0] ?? "", 10)
  if (!Number.isFinite(major) || major !== expectedMajor) {
    throw new Error(
      `remote-widget-loader: host React is ${version}, but expected major ${expectedMajor}. ` +
        `Upstream-hosted widgets would mount against a mismatched React runtime.`,
    )
  }
}
