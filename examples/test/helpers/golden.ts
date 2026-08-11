import fs from "node:fs"
import path from "node:path"

/**
 * Golden-contract helper (FITNESS.md, phase 5a).
 *
 * Deliberately NOT vitest snapshots: `vitest -u` would be a one-command
 * bypass an agent reaches for reflexively. Plain JSON + toEqual makes
 * `vitest -u` a no-op — the ONLY update path is the explicit GOLDEN_UPDATE=1
 * run, which is forbidden in CI, so every golden change is a reviewable JSON
 * diff in the PR (CODEOWNERS applies).
 */

const GOLDEN_DIR = path.join(import.meta.dirname, "..", "golden", "__golden__")

/** Recursively sort object keys so goldens are byte-stable. */
export function stableSort(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableSort)
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value as Record<string, unknown>)
        .sort()
        .map((k) => [k, stableSort((value as Record<string, unknown>)[k])]),
    )
  }
  return value
}

export function goldenPath(name: string): string {
  return path.join(GOLDEN_DIR, `${name}.json`)
}

/**
 * Compares `actual` (key-sorted) against the checked-in golden `name`.
 * Returns the pair for the test to `expect(actual).toEqual(golden)` — the
 * assertion lives in the test so vitest renders its native diff.
 *
 * With GOLDEN_UPDATE=1 (and NOT in CI) the golden is rewritten and the run
 * logs loudly what changed on disk.
 */
export function loadOrUpdateGolden(name: string, actual: unknown): unknown {
  const sorted = stableSort(actual)
  const file = goldenPath(name)
  if (process.env.GOLDEN_UPDATE === "1") {
    if (process.env.CI) {
      throw new Error(
        `GOLDEN_UPDATE is forbidden in CI — goldens change only via a local, committed, reviewed JSON diff (${name}).`,
      )
    }
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(file, JSON.stringify(sorted, null, 2) + "\n", "utf8")
    console.warn(
      `GOLDEN UPDATED: ${path.relative(process.cwd(), file)} — commit and justify the diff in the PR.`,
    )
    return sorted
  }
  if (!fs.existsSync(file)) {
    throw new Error(
      `Golden "${name}" does not exist yet. If this surface is new and intended: GOLDEN_UPDATE=1 pnpm --filter @miragon/mcp-toolkit-examples test golden — then commit the JSON. Never hand-write a golden.`,
    )
  }
  return JSON.parse(fs.readFileSync(file, "utf8")) as unknown
}

/** The agent-facing instruction appended to every golden assertion. */
export const GOLDEN_HINT =
  "The frozen surface diverges from the checked-in golden. If the change is INTENDED: run `GOLDEN_UPDATE=1 pnpm --filter @miragon/mcp-toolkit-examples test golden`, commit the JSON diff and justify it in the PR (for tool descriptions this changes what every consuming model reads). NEVER edit a golden by hand to match broken output — fix the code instead."
