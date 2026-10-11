import fs from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"
import { REPO_ROOT } from "./helpers/fitness-probe.js"

/**
 * The install instructions name the peers with a version. They drifted: the
 * docs claimed every peer was "pinned exactly" and told consumers to install
 * `zod@4.5.4`, while only `mcp-use` is an exact peer (a second copy breaks
 * the widgets' host context) and `zod`, `react`, `react-dom` and
 * `tailwindcss` are ranges so a consumer's own copy dedupes. This test reads
 * every `<peer>@<version>` the install docs write and requires the published
 * peer spec of `@miragon/mcp-toolkit-core`/`-ui` verbatim.
 */

const INSTALL_DOCS = [
  "README.md",
  "docs/getting-started.md",
  "packages/core/README.md",
  "packages/ui/README.md",
]

/**
 * Docs that describe how the peers are pinned (the migration guide has a
 * version table; the starter's README is mirrored to Miragon/mcp-toolkit-starter).
 */
const PIN_DOCS = [
  ...INSTALL_DOCS,
  "docs/guides/migrating-to-mcp-use-2.md",
  "templates/minimal-server/README.md",
]

/** A claim that every peer is exact, in the words the docs used. */
const ALL_PEERS_EXACT = /peer (versions|dependencies) (are|stay) pinned exactly|\bexact peers\b/i

function peersOf(pkg: string): Record<string, string> {
  const json = JSON.parse(
    fs.readFileSync(path.join(REPO_ROOT, "packages", pkg, "package.json"), "utf8"),
  ) as { peerDependencies?: Record<string, string> }
  return json.peerDependencies ?? {}
}

/** The published peer specs of core and ui (the workspace link to core aside). */
const PEERS: Record<string, string> = Object.fromEntries(
  Object.entries({ ...peersOf("core"), ...peersOf("ui") }).filter(
    ([name]) => !name.startsWith("@miragon/"),
  ),
)

/** `mcp-use@2.7.3`, `zod@^4.4.0`, … for every peer name. */
function versionRefs(text: string): { name: string; spec: string }[] {
  const names = Object.keys(PEERS)
    .map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("|")
  const re = new RegExp(`(?<![\\w/@-])(${names})@([~^]?\\d[\\w.-]*)`, "g")
  return [...text.matchAll(re)].map((m) => ({ name: m[1] ?? "", spec: m[2] ?? "" }))
}

describe("install instructions name the published peer specs", () => {
  it("knows the peers (core and ui agree on mcp-use)", () => {
    expect(Object.keys(PEERS).sort()).toEqual([
      "mcp-use",
      "react",
      "react-dom",
      "tailwindcss",
      "zod",
    ])
    expect(peersOf("core")["mcp-use"]).toBe(peersOf("ui")["mcp-use"])
  })

  for (const doc of INSTALL_DOCS) {
    it(`${doc} writes each peer with its published spec`, () => {
      const text = fs.readFileSync(path.join(REPO_ROOT, doc), "utf8")
      const refs = versionRefs(text)
      expect(refs.length, `${doc} names no peer version`).toBeGreaterThan(0)
      for (const { name, spec } of refs) {
        expect(`${name}@${spec}`, doc).toBe(`${name}@${PEERS[name]}`)
      }
    })
  }

  it("no doc claims that every peer is pinned exactly (only mcp-use is)", () => {
    expect(PEERS["mcp-use"]).toMatch(/^\d/)
    for (const doc of PIN_DOCS) {
      const text = fs.readFileSync(path.join(REPO_ROOT, doc), "utf8")
      expect(text, doc).not.toMatch(ALL_PEERS_EXACT)
    }
  })

  it("recognises both phrasings of the claim (self-test)", () => {
    const claims = (text: string) => ALL_PEERS_EXACT.test(text)
    expect(claims("Peer versions are pinned exactly.")).toBe(true)
    expect(claims("They must match the exact peers of the pinned packages.")).toBe(true)
    expect(claims("`mcp-use` is pinned exactly: a second copy breaks it.")).toBe(false)
  })

  it("reads peer versions only, not other packages or prose (self-test)", () => {
    expect(
      versionRefs("pnpm add mcp-use@2.7.3 zod@^4.4.0 @types/react@19.3.0 lucide-react@1.47.0"),
    ).toEqual([
      { name: "mcp-use", spec: "2.7.3" },
      { name: "zod", spec: "^4.4.0" },
    ])
  })
})
