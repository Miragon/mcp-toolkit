import { describe, expect, it } from "vitest"
import { intersectAllowlist } from "../../scripts/mutation-diff.mjs"

/**
 * Negative tests for the phase-4 mutation diff gate's pure glob intersection.
 * The `**` case is the reference implementation's real bug: a hand-rolled
 * glob→RegExp converter shortened `**` to ONE path segment and nested files
 * silently fell out of the gate — picomatch must keep them in.
 */

const CORE_GLOBS = [
  "src/engine/*.ts",
  "src/framework/*.ts",
  "src/tools/*.ts",
  "!src/**/*.test.ts",
  "!src/**/index.ts",
  "!src/tools/register-catalogue-tool.ts",
]

describe("intersectAllowlist", () => {
  it("keeps changed files inside the allowlist, relative to the package", () => {
    expect(
      intersectAllowlist(
        ["packages/core/src/framework/render-view.ts", "packages/core/README.md"],
        "packages/core",
        CORE_GLOBS,
      ),
    ).toEqual(["src/framework/render-view.ts"])
  })

  it("`**` spans MULTIPLE path segments (the reference bug)", () => {
    const globs = ["src/**/*.ts", "!src/**/*.test.ts"]
    expect(intersectAllowlist(["packages/core/src/a/b/c/deep.ts"], "packages/core", globs)).toEqual(
      ["src/a/b/c/deep.ts"],
    )
    expect(
      intersectAllowlist(["packages/core/src/a/b/c/deep.test.ts"], "packages/core", globs),
    ).toEqual([])
  })

  it("applies negated globs at any depth", () => {
    expect(
      intersectAllowlist(
        [
          "packages/core/src/tools/register-tool.ts",
          "packages/core/src/tools/register-tool.test.ts",
          "packages/core/src/tools/index.ts",
          "packages/core/src/tools/register-catalogue-tool.ts",
        ],
        "packages/core",
        CORE_GLOBS,
      ),
    ).toEqual(["src/tools/register-tool.ts"])
  })

  it("ignores files of other packages entirely", () => {
    expect(
      intersectAllowlist(["packages/ui/src/lib/tone-utils.ts"], "packages/core", CORE_GLOBS),
    ).toEqual([])
  })

  it("returns empty for an empty allowlist", () => {
    expect(intersectAllowlist(["packages/core/src/x.ts"], "packages/core", [])).toEqual([])
  })
})
