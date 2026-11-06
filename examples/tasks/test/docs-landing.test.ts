import { readFileSync } from "node:fs"
import path from "node:path"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import {
  buildLandingData,
  headingAnchors,
  LANDING_DATA,
  linesOf,
  listTools,
  readExample,
  type LandingData,
  type Tool,
} from "../../../docs/shots/landing-data.js"
import { startTasksServer, type RunningServer } from "./support/tasks-server.js"

/**
 * The docs' landing page shows this example: its server's tools/list beside the tools.ts the
 * generator wrote for it, and the numbers under them. docs/shots/landing-data.ts writes them into
 * docs/.vitepress/theme/landing-data.json; these tests fail when the file no longer tells the
 * truth. When they do, run `node docs/shots/landing-data.ts` at the repository root and commit
 * the result.
 */
const DOCS = path.resolve(import.meta.dirname, "../../../docs")
const UPDATE = "stale docs landing data: run `node docs/shots/landing-data.ts` and commit it"
const committed = JSON.parse(readFileSync(LANDING_DATA, "utf8")) as LandingData

describe("the docs landing page", () => {
  it("shows tools.ts as committed: every excerpt line under its number, and its line count", () => {
    const example = readExample()
    const lines = linesOf(example.toolsTs)

    expect(committed.toolsTs.lines, UPDATE).toBe(lines.length)
    for (const { from, lines: shown } of committed.toolsTs.excerpts) {
      expect(shown, `${UPDATE} (excerpt from line ${from})`).toEqual(
        lines.slice(from - 1, from - 1 + shown.length),
      )
    }
  })

  it("links every step and the next link to a page and a heading that exist", () => {
    const vue = readFileSync(path.join(DOCS, ".vitepress/theme/HomeLanding.vue"), "utf8")
    const links = [...vue.matchAll(/link: "(\/[^"#]*)(?:#([^"]+))?"/g)]

    expect(links.length).toBeGreaterThanOrEqual(5)
    for (const [link, page = "", anchor] of links) {
      const markdown = readFileSync(path.join(DOCS, `${page}.md`), "utf8")
      if (anchor !== undefined) {
        expect([...headingAnchors(markdown)], `no heading for ${link}`).toContain(anchor)
      }
    }
  })

  describe("against the example server", () => {
    let server: RunningServer
    let tools: Tool[]

    beforeAll(async () => {
      server = await startTasksServer()
      tools = await listTools(server.url)
    })

    afterAll(async () => {
      await server?.close()
    })

    it("counts the server's tools and the bytes of its tools/list", () => {
      expect(committed.toolsList.tools, UPDATE).toBe(tools.length)
      expect(committed.toolsList.bytes, UPDATE).toBe(Buffer.byteLength(JSON.stringify(tools)))
    })

    it("shows the tool's entry as the server sends it, but for the marked output schema", () => {
      const tool = tools.find(({ name }) => name === committed.toolsList.tool)
      const shown = committed.toolsList.entry.join("\n")
      const cut = /\{ … (.*) … \}/.exec(shown)

      expect(cut?.[1], UPDATE).toBe(
        Object.keys(tool?.outputSchema?.properties ?? {})
          .map((name) => JSON.stringify(name))
          .join(", "),
      )
      // Restored, the entry is the server's, key for key and in the server's order.
      const restored: unknown = JSON.parse(
        shown.replace(/\{ … .* … \}/, JSON.stringify(tool?.outputSchema)),
      )
      expect(JSON.stringify(restored), UPDATE).toBe(JSON.stringify(tool))
    })

    it("holds exactly what docs/shots/landing-data.ts derives from the server and the files", () => {
      expect(committed, UPDATE).toEqual(buildLandingData(tools, readExample()))
    })
  })
})
