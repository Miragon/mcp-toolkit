import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: ["src/**/*.test.ts", "src/**/*.d.ts"],
      reporter: ["text-summary", "json-summary"],
      // Floors at the measured values: raise them when coverage rises, never lower them.
      thresholds: { statements: 100, branches: 100, functions: 100, lines: 100 },
    },
  },
})
