import { defineConfig, type Plugin } from "vite"
import { fileURLToPath } from "node:url"
import path from "node:path"
import react from "@vitejs/plugin-react"
import tailwindcss from "@tailwindcss/vite"
import { viteSingleFile } from "vite-plugin-singlefile"
import { buildSharedRuntimeImportMap } from "@miragon/mcp-toolkit-ui"

const here = path.dirname(fileURLToPath(import.meta.url))

/**
 * Merges the shared-runtime import-map entries (mcp-use/react, the three
 * @miragon/mcp-toolkit-ui barrels, @tanstack/react-query) into the hand-written
 * react/react-dom entries in index.html. Generating them from
 * `buildSharedRuntimeImportMap` keeps the HTML from ever drifting from the
 * shim constants in `packages/ui/src/runtime/shared-runtime.ts` — the same
 * constants `main.tsx` satisfies via `exposeSharedRuntime`.
 */
function sharedRuntimeImportMap(): Plugin {
  return {
    name: "shared-runtime-import-map",
    transformIndexHtml: {
      order: "pre",
      handler(html) {
        const match = /<script type="importmap">([\s\S]*?)<\/script>/.exec(html)
        if (!match?.[1]) {
          throw new Error('app-bundle/index.html: no <script type="importmap"> found')
        }
        const map = JSON.parse(match[1]) as { imports: Record<string, string> }
        Object.assign(
          map.imports,
          buildSharedRuntimeImportMap({ mcpUseReact: true, toolkitUi: true, reactQuery: true }),
        )
        return html.replace(
          match[0],
          `<script type="importmap">${JSON.stringify(map, null, 2)}</script>`,
        )
      },
    },
  }
}

/**
 * Builds the widget bundle as a single self-contained `index.html` that the
 * host serves via `createFrameworkApp`'s `app.htmlPath`. Inlining matters
 * here: the Inspector renders the HTML inside an iframe fed from the MCP
 * resource content — there is no second HTTP request for chunks.
 */
export default defineConfig({
  root: here,
  plugins: [sharedRuntimeImportMap(), react(), tailwindcss(), viteSingleFile()],
  build: {
    outDir: "dist",
    emptyOutDir: true,
    assetsInlineLimit: 100_000_000,
    cssCodeSplit: false,
  },
})
