import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
    coverage: {
      provider: "v8",
      include: ["src/**"],
      exclude: ["src/**/*.test.ts", "src/test-support/**"],
      reporter: ["text-summary", "json-summary"],
      // Floors at the measured values, rounded down: raise them when coverage rises.
      thresholds: { statements: 99, branches: 97, functions: 97, lines: 99 },
    },
  },
})
