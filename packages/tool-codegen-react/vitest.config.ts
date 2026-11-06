import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    include: ["src/**/*.test.{ts,tsx}"],
    environment: "happy-dom",
    setupFiles: ["src/test-support/setup.ts"],
    restoreMocks: true,
    coverage: {
      provider: "v8",
      include: ["src/**/*.{ts,tsx}"],
      exclude: ["src/**/*.test.{ts,tsx}", "src/test-support/**"],
      reporter: ["text-summary", "json-summary"],
      // Floors at the measured values: raise them when coverage rises, never lower them.
      thresholds: { statements: 100, branches: 100, functions: 100, lines: 100 },
    },
  },
})
