import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    include: ["**/*.test.ts"],
    environment: "node",
    // The smoke test boots a real MCP host and speaks the protocol over a
    // loopback socket; give the in-process boot + handshake some headroom.
    testTimeout: 20000,
    hookTimeout: 20000,
  },
})
