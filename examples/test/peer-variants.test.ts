import fs from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"
import { REPO_ROOT } from "./helpers/fitness-probe.js"

/**
 * ONE mcp-use instance, everywhere the toolkit is developed or scaffolded.
 *
 * mcp-use carries optional peers (the bundled inspector's `lucide-react`,
 * ext-apps' `@modelcontextprotocol/server`) that pnpm resolves per importer.
 * When two importers resolve them differently, pnpm splits mcp-use into two
 * peer variants: packages/ui then imports `mcp-use/react` from one copy and a
 * view from the other, and in the standalone dev loop every widget renders
 * "View error: mcp-use/react hooks require a browser view mounted by
 * bootstrapView" (2.7.0 shipped with three variants). The build dedupes and
 * stays green, so this file pins the cause; scripts/check-standalone-dev.mjs
 * proves the effect on the served module graph.
 */

const read = (...segments: string[]) => fs.readFileSync(path.join(REPO_ROOT, ...segments), "utf8")
const manifest = (...segments: string[]) =>
  JSON.parse(read(...segments)) as {
    dependencies?: Record<string, string>
    devDependencies?: Record<string, string>
  }

const lock = read("pnpm-lock.yaml")
const workspace = read("pnpm-workspace.yaml")
const ui = manifest("packages", "ui", "package.json")
const core = manifest("packages", "core", "package.json")
const template = manifest("templates", "minimal-server", "package.json")

/** The resolved snapshot keys of a package: `name@version(peer)(peer)…`. */
function snapshotKeys(name: string): string[] {
  const snapshots = lock.slice(lock.indexOf("\nsnapshots:\n"))
  const escaped = name.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&")
  return [...snapshots.matchAll(new RegExp(`^  '?(${escaped}@[^:']+)'?:$`, "gm"))].map(
    (m) => m[1] ?? "",
  )
}

/** The value of one `overrides:` entry in pnpm-workspace.yaml. */
function override(selector: string): string | undefined {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&")
  return new RegExp(`^  "?${escaped}"?:\\s*(\\S+)\\s*$`, "m").exec(workspace)?.[1]
}

/** mcp-use's own exact dependency on the MCP server SDK, from its lockfile entry. */
function mcpUseServerDependency(): string | undefined {
  const [key] = snapshotKeys("mcp-use")
  if (key === undefined) return undefined
  const block = lock.slice(lock.indexOf(`\n  ${key}:\n`) + 1)
  const deps = block.slice(0, block.indexOf("\n\n"))
  return /\n {6}'@modelcontextprotocol\/server': ([\d.]+)\n/.exec(deps)?.[1]
}

describe("one mcp-use peer variant", () => {
  it("resolves mcp-use exactly once in pnpm-lock.yaml", () => {
    const variants = snapshotKeys("mcp-use")
    expect(
      variants.map((key) =>
        (key.match(/(lucide-react@[\d.]+|@modelcontextprotocol\/server@[\d.]+)/g) ?? []).join(" "),
      ),
      "pnpm split mcp-use into several peer variants (listed by the peers that differ). " +
        "Pin the drifting peer in pnpm-workspace.yaml `overrides` to the version the graph " +
        "already runs — a second variant breaks every widget in the standalone dev loop.",
    ).toHaveLength(1)
  })

  it("pins the inspector's lucide-react peer to packages/ui's lucide-react", () => {
    const uiLucide = ui.dependencies?.["lucide-react"]
    expect(uiLucide).toMatch(/^\d+\.\d+\.\d+$/)
    expect(override("@mcp-use/inspector>lucide-react")).toBe(uiLucide)
  })

  it("pins the MCP server SDK peer, and core's dev copy, to mcp-use's own dependency", () => {
    const server = mcpUseServerDependency()
    expect(server).toMatch(/^\d+\.\d+\.\d+$/)
    expect(override("@modelcontextprotocol/ext-apps>@modelcontextprotocol/server")).toBe(server)
    expect(core.devDependencies?.["@modelcontextprotocol/server"]).toBe(server)
  })
})

describe("templates/minimal-server shares the toolkit's lucide-react", () => {
  it("pins lucide-react to the version @miragon/mcp-toolkit-ui depends on", () => {
    // A different copy splits mcp-use in the starter's graph too, and icons the
    // starter imports then miss the stroke the toolkit's LucideProvider sets.
    expect(template.dependencies?.["lucide-react"]).toBe(ui.dependencies?.["lucide-react"])
  })
})
