/**
 * The MIT license reaches every published tarball: npm packs a LICENSE file only from the
 * package's own folder, so each published package carries a copy of the root LICENSE and
 * names it in its `license` field. Run with `pnpm test:scripts` (node --test).
 */
import assert from "node:assert/strict"
import { existsSync, readdirSync, readFileSync } from "node:fs"
import path from "node:path"
import { describe, it } from "node:test"
import { fileURLToPath } from "node:url"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const license = readFileSync(path.join(root, "LICENSE"), "utf8")

const published = readdirSync(path.join(root, "packages"), { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => path.join("packages", entry.name))
  .filter((dir) => existsSync(path.join(root, dir, "package.json")))
  .filter((dir) => !JSON.parse(readFileSync(path.join(root, dir, "package.json"), "utf8")).private)

describe("license", () => {
  it("is MIT, held by Miragon GmbH", () => {
    assert.match(license, /^MIT License\n\nCopyright \(c\) \d{4} Miragon GmbH\n/)
  })

  it("finds the published packages", () => {
    assert.ok(published.length >= 3, published.join(", "))
  })

  for (const dir of published) {
    it(`ships with ${dir}`, () => {
      const manifest = JSON.parse(readFileSync(path.join(root, dir, "package.json"), "utf8"))
      assert.equal(manifest.license, "MIT")
      assert.equal(readFileSync(path.join(root, dir, "LICENSE"), "utf8"), license)
    })
  }
})
