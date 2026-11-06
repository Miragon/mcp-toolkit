import { defineConfig } from "vitest/config"

// Its own config, so the tests do not load vite.config.ts (React plugin, dev proxy).
export default defineConfig({
  test: {
    include: ["test/**/*.test.{ts,tsx}"],
    environment: "node",
    unstubEnvs: true,
    restoreMocks: true,
    // The servers log every request; that output only helps when a test fails.
    silent: "passed-only",
  },
})
