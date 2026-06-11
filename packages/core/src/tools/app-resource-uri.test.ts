import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest"
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { deriveAppResourceUri } from "./app-resource-uri.js"

describe("deriveAppResourceUri", () => {
  let dir: string
  let warnSpy: MockInstance<typeof console.warn>

  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), "mcp-toolkit-uri-"))
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {})
  })

  afterEach(() => {
    warnSpy.mockRestore()
    rmSync(dir, { recursive: true, force: true })
  })

  it("derives ui://<appName>/mcp-app.<hash>.html from the file content", () => {
    const htmlPath = path.join(dir, "mcp-app.html")
    writeFileSync(htmlPath, "<html>hello</html>")
    const uri = deriveAppResourceUri({ appName: "automation-mcp", htmlPath })
    expect(uri).toMatch(/^ui:\/\/automation-mcp\/mcp-app\.[0-9a-f]{10}\.html$/)
    expect(warnSpy).not.toHaveBeenCalled()
  })

  it("produces a stable hash for identical content and a different one when it changes", () => {
    const htmlPath = path.join(dir, "mcp-app.html")
    writeFileSync(htmlPath, "v1")
    const first = deriveAppResourceUri({ appName: "app", htmlPath })
    const again = deriveAppResourceUri({ appName: "app", htmlPath })
    expect(again).toBe(first)

    writeFileSync(htmlPath, "v2")
    const changed = deriveAppResourceUri({ appName: "app", htmlPath })
    expect(changed).not.toBe(first)
  })

  it("falls back to the default dev URI and warns when the file is missing", () => {
    const uri = deriveAppResourceUri({
      appName: "app",
      htmlPath: path.join(dir, "does-not-exist.html"),
    })
    expect(uri).toBe("ui://app/mcp-app.dev.html")
    expect(warnSpy).toHaveBeenCalledTimes(1)
    expect(warnSpy.mock.calls[0]?.[0]).toMatch(/could not read widget bundle/)
  })

  it("honours a custom devFallback for the missing-file path", () => {
    const uri = deriveAppResourceUri({
      appName: "app",
      htmlPath: path.join(dir, "missing.html"),
      devFallback: "ui://app/placeholder.html",
    })
    expect(uri).toBe("ui://app/placeholder.html")
  })
})
