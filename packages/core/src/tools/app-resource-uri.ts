import { createHash } from "node:crypto"
import { readFileSync } from "node:fs"

export interface DeriveAppResourceUriInput {
  /** Server / app name used as the resource URI authority (`ui://<appName>/...`). */
  appName: string
  /** Absolute path to the bundled `mcp-app.html` served under the URI. */
  htmlPath: string
  /**
   * Resource URI used when the bundle file is missing (e.g. `dist` not built
   * yet in a dev loop). Defaults to `ui://<appName>/mcp-app.dev.html` so a
   * stable, obviously-non-production URI is still served. Pass a custom value
   * only when a different placeholder is needed.
   */
  devFallback?: string
}

/**
 * Derives a content-hashed MCP UI resource URI for the widget bundle.
 *
 * MCP hosts cache the widget bundle by its resource URI; with a fixed URI a
 * host keeps serving a stale bundle even across server restarts. Hashing the
 * file content into the URI (`ui://<appName>/mcp-app.<hash>.html`) forces a
 * fresh fetch whenever the bundle actually changes — and only then.
 *
 * When the bundle file cannot be read (commonly `dist` not built yet), it
 * falls back to {@link DeriveAppResourceUriInput.devFallback} — a stable
 * `ui://<appName>/mcp-app.dev.html` by default — and emits a boot warning so
 * the missing file is visible in logs rather than silently degrading.
 */
export function deriveAppResourceUri(input: DeriveAppResourceUriInput): string {
  const { appName, htmlPath } = input
  const devFallback = input.devFallback ?? `ui://${appName}/mcp-app.dev.html`
  try {
    const hash = createHash("sha256").update(readFileSync(htmlPath)).digest("hex").slice(0, 10)
    return `ui://${appName}/mcp-app.${hash}.html`
  } catch {
    console.warn(
      `[mcp-toolkit] could not read widget bundle at "${htmlPath}" — ` +
        `serving the dev fallback resource URI "${devFallback}". ` +
        `Build the bundle (dist/mcp-app.html) before shipping to production.`,
    )
    return devFallback
  }
}
