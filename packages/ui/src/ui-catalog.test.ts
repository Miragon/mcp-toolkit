import { describe, expect, it } from "vitest"
import catalog from "../ui-catalog.json" with { type: "json" }
import * as rootBarrel from "./index.js"
import * as appBarrel from "./app/index.js"
import * as hooksBarrel from "./hooks/index.js"

/**
 * Drift guard for `packages/ui/ui-catalog.json` — the machine-readable catalog
 * the docs (`docs/reference/components.md`) and the `build-mcp-widget` skill
 * point an on-top-prompting agent at. The catalog is hand-maintained (the
 * curated `whenToUse`/prop descriptions are the LLM-facing value), so these
 * tests pin it to the real package surface: every entry must name a symbol that
 * is actually exported from the `importPath` it claims. A rename or moved export
 * fails here instead of silently feeding an agent a dead import.
 */

interface CatalogProp {
  name: string
  type: string
  required: boolean
  description: string
}

interface CatalogEntry {
  name: string
  export: string
  importPath: string
  kind: string
  group: string
  parts?: string[]
  props: CatalogProp[]
  whenToUse: string
}

interface Catalog {
  version: string
  importPaths: Record<"root" | "app" | "hooks", string>
  components: CatalogEntry[]
}

// Imported as a JSON module (not read via `node:fs`) so this browser-oriented
// package keeps typechecking without `@types/node`. The `as unknown as Catalog`
// cast pins the structural contract the assertions below rely on.
const catalogData = catalog as unknown as Catalog

/** Map each `importPath` to the live module namespace it must resolve through. */
const BARRELS: Record<string, Record<string, unknown>> = {
  [catalogData.importPaths.root]: rootBarrel,
  [catalogData.importPaths.app]: appBarrel,
  [catalogData.importPaths.hooks]: hooksBarrel,
}

describe("ui-catalog.json", () => {
  it("declares the three real subpath imports", () => {
    expect(catalogData.importPaths).toEqual({
      root: "@miragon/mcp-toolkit-ui",
      app: "@miragon/mcp-toolkit-ui/app",
      hooks: "@miragon/mcp-toolkit-ui/hooks",
    })
  })

  it("has unique entry names", () => {
    const names = catalogData.components.map((c) => c.name)
    expect(new Set(names).size).toBe(names.length)
  })

  it("references only the three known import paths", () => {
    const known = new Set(Object.values(catalogData.importPaths))
    for (const entry of catalogData.components) {
      expect(known, `${entry.name} → ${entry.importPath}`).toContain(entry.importPath)
    }
  })

  describe("every entry's `export` is reachable from its `importPath`", () => {
    for (const entry of catalogData.components) {
      it(`${entry.name} is exported from ${entry.importPath}`, () => {
        const barrel = BARRELS[entry.importPath]
        expect(barrel, `no barrel for ${entry.importPath}`).toBeDefined()
        // Types (e.g. DescribeForModel) erase at runtime, so they can't be probed
        // on the namespace object — assert only value exports here. Type exports
        // are guarded by the package's own typecheck (the barrels re-export them).
        if (entry.kind === "type") return
        expect(
          Object.prototype.hasOwnProperty.call(barrel, entry.export),
          `${entry.export} missing from ${entry.importPath}`,
        ).toBe(true)
      })
    }
  })

  it("keeps every multi-part component's parts exported from the same barrel", () => {
    for (const entry of catalogData.components) {
      if (!entry.parts) continue
      const barrel = BARRELS[entry.importPath]
      for (const part of entry.parts) {
        expect(
          Object.prototype.hasOwnProperty.call(barrel, part),
          `${entry.name} part ${part} missing from ${entry.importPath}`,
        ).toBe(true)
      }
    }
  })

  it("gives every entry at least a name, kind, group and whenToUse", () => {
    for (const entry of catalogData.components) {
      expect(entry.name, "name").toBeTruthy()
      expect(entry.kind, `${entry.name} kind`).toBeTruthy()
      expect(entry.group, `${entry.name} group`).toBeTruthy()
      expect(entry.whenToUse, `${entry.name} whenToUse`).toBeTruthy()
      expect(Array.isArray(entry.props), `${entry.name} props`).toBe(true)
    }
  })
})
