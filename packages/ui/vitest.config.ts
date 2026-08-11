import { defineConfig } from "vitest/config"
import thresholds from "../../ratchets/coverage-thresholds.json"

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    environment: "node",
    coverage: {
      provider: "v8",
      include: ["src/**"],
      exclude: ["src/**/*.test.*"],
      reporter: ["text-summary", "json-summary"],
      // Raise-only ratchet (FITNESS.md phase 2) — raise the floor, never
      // lower it; scripts/check-ratchets.mjs (phase 2b) enforces the
      // direction.
      thresholds: thresholds.ui,
    },
  },
})
