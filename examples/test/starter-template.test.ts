import fs from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"

/**
 * Drift guard for `templates/minimal-server` — the source of truth mirrored
 * into `Miragon/mcp-toolkit-starter` on every push to `main`.
 *
 * The template is NOT a workspace package (that is the point: it scaffolds
 * against the *published* `@miragon` packages), so nothing else in CI reads
 * it. Its `@miragon` pins are bumped by release-please at release time, which
 * leaves exactly one thing a human has to keep in step by hand: the runtime
 * peers the toolkit declares. Pin that invariant here — a peer bump in a
 * published package's manifest that forgets the template fails this test
 * instead of shipping a starter that installs with unmet peers forever.
 *
 * It lives in `examples/` because that is the repo's Node-side test surface
 * (`pnpm -r test`); it exercises no example code.
 */

const REPO_ROOT = path.join(import.meta.dirname, "..", "..")

function readManifest(...segments: string[]): {
  dependencies?: Record<string, string>
  devDependencies?: Record<string, string>
  peerDependencies?: Record<string, string>
} {
  return JSON.parse(fs.readFileSync(path.join(REPO_ROOT, ...segments), "utf8")) as never
}

const template = readManifest("templates", "minimal-server", "package.json")
const core = readManifest("packages", "core", "package.json")
const ui = readManifest("packages", "ui", "package.json")

/** Workspace-internal peers resolve through pnpm, not through the template. */
const isWorkspacePeer = (name: string) => name.startsWith("@miragon/")

/** The template installs runtime peers as deps and build-time ones as devDeps. */
const templatePin = (name: string) =>
  template.dependencies?.[name] ?? template.devDependencies?.[name]

const parseVersion = (version: string) => version.split(".").map(Number) as [number, number, number]

/** Published peers are exact pins or caret ranges; the template pin must satisfy them. */
const pinSatisfiesPeer = (pin: string, peerRange: string) => {
  if (!peerRange.startsWith("^")) return pin === peerRange
  const [peerMajor, peerMinor, peerPatch] = parseVersion(peerRange.slice(1))
  const [pinMajor, pinMinor, pinPatch] = parseVersion(pin)
  if (pinMajor !== peerMajor) return false
  if (pinMinor !== peerMinor) return pinMinor > peerMinor
  return pinPatch >= peerPatch
}

describe("templates/minimal-server", () => {
  const peers = Object.entries({ ...core.peerDependencies, ...ui.peerDependencies }).filter(
    ([name]) => !isWorkspacePeer(name),
  )

  it("declares every peer the published packages require", () => {
    expect(peers.length).toBeGreaterThan(0)
    expect(peers.filter(([name]) => templatePin(name) === undefined).map(([name]) => name)).toEqual(
      [],
    )
  })

  it("pins each peer to a version that satisfies the range the packages declare", () => {
    expect(
      peers
        .filter(([name, version]) => !pinSatisfiesPeer(templatePin(name) as string, version))
        .map(([name, version]) => `${name}: template ${templatePin(name)} vs peer ${version}`),
    ).toEqual([])
  })

  it("pins the @miragon packages to one released version", () => {
    const pins = [
      template.dependencies?.["@miragon/mcp-toolkit-core"],
      template.dependencies?.["@miragon/mcp-toolkit-ui"],
    ]
    expect(pins.every((pin) => pin !== undefined && /^\d+\.\d+\.\d+$/.test(pin))).toBe(true)
    expect(new Set(pins).size).toBe(1)
  })
})
