import { defineConfig } from "vite"
import { fileURLToPath } from "node:url"
import path from "node:path"
import react from "@vitejs/plugin-react"
import tailwindcss from "@tailwindcss/vite"

const here = path.dirname(fileURLToPath(import.meta.url))

/**
 * Dev/build config for the host-portability example — a normal SPA that runs in
 * a real browser tab (`vite dev`), not inside an MCP host iframe. It demonstrates
 * the *same* hand-built widget under three host bridges, so it uses the same
 * React + Tailwind + UI globals setup as the rest of the toolkit.
 */
export default defineConfig({
  root: here,
  plugins: [react(), tailwindcss()],
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
})
