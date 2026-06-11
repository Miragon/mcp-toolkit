import { defineConfig } from "vite"
import { fileURLToPath } from "node:url"
import path from "node:path"
import react from "@vitejs/plugin-react"
import tailwindcss from "@tailwindcss/vite"

const here = path.dirname(fileURLToPath(import.meta.url))

/**
 * Dev/build config for the widget playground — a "Storybook for MCP widgets".
 * Unlike `app-bundle`, this is a normal multi-file SPA (no single-file inlining):
 * it runs in a real browser tab via `vite dev`, not inside an MCP host iframe.
 * Same React + Tailwind + UI globals setup so the example widgets render exactly
 * as they would in a host.
 */
export default defineConfig({
  root: here,
  plugins: [react(), tailwindcss()],
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
})
