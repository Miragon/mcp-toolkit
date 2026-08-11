import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { defineConfig } from "vitest/config"

// Raise-only ratchet (FITNESS.md phase 2) — raise the floor, never lower it;
// scripts/check-ratchets.mjs (phase 2b) enforces the direction. Resolved by
// walking up from this config so it also works inside Stryker's sandbox copy
// (phase 4), and throws when missing: the ratchet must never drop silently.
function loadThresholds(pkg: string): Record<string, number> {
  let dir = path.dirname(fileURLToPath(import.meta.url))
  for (let i = 0; i < 8; i++) {
    const file = path.join(dir, "ratchets", "coverage-thresholds.json")
    if (fs.existsSync(file)) {
      const all = JSON.parse(fs.readFileSync(file, "utf8")) as Record<
        string,
        Record<string, number> | undefined
      >
      const entry = all[pkg]
      // A missing package entry would hand vitest `thresholds: undefined` —
      // coverage silently unenforced, the exact failure this loader exists to
      // prevent.
      if (!entry) {
        throw new Error(
          `ratchets/coverage-thresholds.json has no entry for "${pkg}" — the coverage ratchet must never be dropped silently`,
        )
      }
      return entry
    }
    dir = path.dirname(dir)
  }
  throw new Error(
    "ratchets/coverage-thresholds.json not found — the coverage ratchet must never be dropped silently",
  )
}

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
    coverage: {
      provider: "v8",
      include: ["src/**"],
      exclude: ["src/**/*.test.*"],
      reporter: ["text-summary", "json-summary"],
      thresholds: loadThresholds("core"),
    },
  },
})
