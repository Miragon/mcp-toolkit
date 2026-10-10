/// <reference types="node" />
import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import { GEIST_FONT_FILES, fontFaces } from "./fonts.js"

describe("fontFaces (opt-in Geist by URL)", () => {
  const css = fontFaces({ baseUrl: "https://mcp.example.com/fonts" })

  it("declares Geist and Geist Mono — the families the font tokens name first", () => {
    expect(css).toContain('font-family: "Geist";')
    expect(css).toContain('font-family: "Geist Mono";')
    expect(css.match(/@font-face \{/g)).toHaveLength(2)
  })

  it("points at the latin variable woff2 files under the base URL", () => {
    expect(css).toContain(
      'src: url("https://mcp.example.com/fonts/geist-latin-wght-normal.woff2") format("woff2");',
    )
    expect(css).toContain(
      'src: url("https://mcp.example.com/fonts/geist-mono-latin-wght-normal.woff2") format("woff2");',
    )
  })

  it("covers the whole weight axis, swaps by default and limits itself to latin", () => {
    expect(css.match(/font-weight: 100 900;/g)).toHaveLength(2)
    expect(css.match(/font-display: swap;/g)).toHaveLength(2)
    expect(css.match(/font-style: normal;/g)).toHaveLength(2)
    expect(css.match(/unicode-range: U\+0000-00FF,/g)).toHaveLength(2)
  })

  it("joins base URL and file name with exactly one slash", () => {
    const out = fontFaces({ baseUrl: "/fonts///", files: { sans: "/a.woff2", mono: "b.woff2" } })
    expect(out).toContain('url("/fonts/a.woff2")')
    expect(out).toContain('url("/fonts/b.woff2")')
  })

  it("honours a custom font-display strategy", () => {
    expect(fontFaces({ baseUrl: "/f", display: "optional" })).toContain("font-display: optional;")
  })

  it('refuses URLs that could break out of url("…")', () => {
    for (const baseUrl of ['/f")}body{', "/f'x", "/f x", "/f(", "/f\\", "/f<x>"]) {
      expect(() => fontFaces({ baseUrl }), baseUrl).toThrow(/refusing a font URL/)
    }
  })

  it("names the files @fontsource-variable ships, so a server can copy them as-is", () => {
    for (const [pkg, file] of [
      ["@fontsource-variable/geist", GEIST_FONT_FILES.sans],
      ["@fontsource-variable/geist-mono", GEIST_FONT_FILES.mono],
    ] as const) {
      const shipped = readFileSync(
        new URL(`../../node_modules/${pkg}/files/${file}`, import.meta.url),
      )
      expect(shipped.byteLength, `${pkg}/files/${file}`).toBeGreaterThan(1000)
    }
  })
})
