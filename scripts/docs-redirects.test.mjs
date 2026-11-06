/**
 * The 2.x site served pages under the same base that this site no longer builds. Each one has a
 * static stub in docs/public/ at the path GitHub Pages served it from (`<page>.html`, also reached
 * without `.html`): it sends the reader to the page that took over its topic, or to its file at
 * the tag v2.9.0. These tests keep a stub from pointing at a page that was renamed away or from
 * shadowing a page of the site. Run with `pnpm test:scripts` (node --test).
 */
import assert from "node:assert/strict"
import { existsSync, readdirSync, readFileSync } from "node:fs"
import path from "node:path"
import { describe, it } from "node:test"
import { fileURLToPath } from "node:url"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const docs = path.join(root, "docs")
const SITE = "https://miragon.github.io/mcp-toolkit/"
const OLD_DOCS = "https://github.com/Miragon/mcp-toolkit/blob/v2.9.0/docs/"
const literal = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")

const stubs = readdirSync(path.join(docs, "public"), { recursive: true })
  .filter((file) => file.endsWith(".html"))
  .map((file) => file.replaceAll("\\", "/"))
  .sort()

describe("docs redirect stubs", () => {
  it("cover the old site's pages", () => {
    assert.ok(stubs.length >= 26, stubs.join(", "))
  })

  for (const stub of stubs) {
    const page = stub.replace(/\.html$/, "")
    const html = readFileSync(path.join(docs, "public", stub), "utf8")
    const [, target] = /http-equiv="refresh"\s+content="0; url=([^"]+)"/.exec(html) ?? []

    it(`${stub} sends the reader to one target and stays out of search`, () => {
      assert.ok(target, "no meta refresh")
      assert.match(html, new RegExp(`<link\\s+rel="canonical"\\s+href="${literal(target)}"`))
      assert.match(html, new RegExp(`<a\\s+href="${literal(target)}"`))
      assert.match(html, /<meta name="robots" content="noindex" \/>/)
    })

    it(`${stub} shadows no page and points at one that exists`, () => {
      assert.equal(existsSync(path.join(docs, `${page}.md`)), false)
      if (target?.startsWith(SITE)) {
        assert.ok(existsSync(path.join(docs, `${target.slice(SITE.length)}.md`)), target)
      } else {
        // A topic the site no longer covers: the same page at the tag.
        assert.equal(target, `${OLD_DOCS}${page}.md`)
      }
    })
  }
})
