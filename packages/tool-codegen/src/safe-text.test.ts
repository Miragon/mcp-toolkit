import fc from "fast-check"
import { describe, expect, it } from "vitest"
import {
  commentText,
  docComment,
  escapeInvisible,
  sourceOf,
  terminalText,
  withOriginsOnly,
} from "./safe-text.js"

fc.configureGlobal({ seed: 42, numRuns: 200 })

const char = (code: number) => String.fromCodePoint(code)
const INVISIBLE_SAMPLES = [
  // controls, bidirectional and zero-width characters
  0x00, 0x07, 0x09, 0x0b, 0x0d, 0x1b, 0x1f, 0x7f, 0x85, 0x9f, 0x061c, 0x200b, 0x200f, 0x2028,
  0x2029, 0x202a, 0x202e, 0x2066, 0x2069, 0xfeff,
  // other format and default-ignorable characters: soft hyphen, combining grapheme joiner,
  // Hangul fillers, Mongolian vowel separator, word joiner and invisible operators, variation
  // selectors, interlinear annotations, a lone surrogate
  0x00ad, 0x034f, 0x115f, 0x1160, 0x180e, 0x2060, 0x2064, 0x2065, 0x206a, 0x206f, 0x3164, 0xfe00,
  0xfe0f, 0xffa0, 0xfff9, 0xfffb, 0xd800,
  // beyond the BMP: musical formatting, Unicode tags (ASCII smuggling), variation selector 17
  0x1d173, 0xe0001, 0xe0041, 0xe007f, 0xe0100,
]
const VISIBLE_SAMPLES = [
  0x20, 0x7e, 0xa0, 0xe9, 0x0430, 0x061b, 0x200a, 0x2010, 0x2027, 0x202f, 0x20ac, 0xfefe, 0xff01,
  0x1f600,
]

/** The `\u` escapes of a string's UTF-16 units. */
const unitEscapes = (text: string) =>
  Array.from(
    { length: text.length },
    (_, i) => `\\u${text.charCodeAt(i).toString(16).padStart(4, "0")}`,
  ).join("")

describe("commentText", () => {
  // Bug class guarded: #177, upstream text closing the JSDoc it sits in.
  it("never contains */, for any text", () => {
    fc.assert(
      fc.property(fc.string({ unit: "binary" }), (text) => {
        expect(commentText(text)).not.toContain("*/")
      }),
    )
  })

  it("escapes */ and unifies line breaks", () => {
    expect(commentText("a */ b **/ c */*/")).toBe("a *\\/ b **\\/ c *\\/*\\/")
    expect(commentText(`1\r\n2\r3${char(0x2028)}4${char(0x2029)}5\n6`)).toBe("1\n2\n3\n4\n5\n6")
  })

  it("drops invisible characters, also when that would join * and /", () => {
    for (const code of INVISIBLE_SAMPLES.filter(
      (code) => ![0x09, 0x0d, 0x2028, 0x2029].includes(code),
    )) {
      expect(commentText(`*${char(code)}/`)).toBe("*\\/")
    }
    expect(commentText("a\tb")).toBe("a b")
    expect(commentText(VISIBLE_SAMPLES.map(char).join(""))).toBe(VISIBLE_SAMPLES.map(char).join(""))
  })
})

describe("docComment", () => {
  it("renders one line inline and several as a block, at the indentation", () => {
    expect(docComment("  Lists tasks.  ")).toBe("/** Lists tasks. */\n")
    expect(docComment("\n\nFirst.\n\n  Indented.  \n\n", "    ")).toBe(
      "    /**\n     * First.\n     *\n     *   Indented.\n     */\n",
    )
  })

  it("renders nothing for no text", () => {
    expect(docComment(undefined)).toBe("")
    expect(docComment(42)).toBe("")
    expect(docComment(" \n\t\n ")).toBe("")
  })

  it("cannot be closed early by its text", () => {
    expect(docComment("*/ evil() /*")).toBe("/** *\\/ evil() /* */\n")
    expect(docComment("a*\n/b")).toBe("/**\n * a*\n * /b\n */\n")
  })

  // TypeScript reads the last line of a block comment as a directive: inline, `/** @ts-ignore */`
  // would silence the error of the generated line below it.
  it("puts a line that starts with @ into a block, so it never ends the comment's last line", () => {
    for (const text of ["@ts-ignore", "  @ts-expect-error  ", "@deprecated use v2"]) {
      expect(docComment(text, "  ")).toBe(`  /**\n   * ${text.trim()}\n   */\n`)
    }
    expect(docComment("Not @ts-ignore")).toBe("/** Not @ts-ignore */\n")
  })
})

describe("escapeInvisible", () => {
  it("escapes every invisible character but \\n, and nothing else", () => {
    for (const code of INVISIBLE_SAMPLES) {
      expect(escapeInvisible(char(code)), code.toString(16)).toBe(unitEscapes(char(code)))
    }
    expect(escapeInvisible("\n")).toBe("\n")
    const visible = VISIBLE_SAMPLES.map(char).join("")
    expect(escapeInvisible(visible)).toBe(visible)
  })

  it("escapes a character beyond the BMP as a surrogate pair, which JSON reads back", () => {
    const tag = char(0xe0041)
    expect(escapeInvisible(`a${tag}b`)).toBe("a\\udb40\\udc41b")
    expect(JSON.parse(`"${escapeInvisible(`a${tag}b`)}"`)).toBe(`a${tag}b`)
  })
})

describe("withOriginsOnly", () => {
  it.each([
    [
      "Redirect to http://127.0.0.1:4000/mcp/s/S3CRET/ not followed",
      "Redirect to http://127.0.0.1:4000 not followed",
    ],
    [
      "from HTTPS://u:p@a.example/x?k=1 to 'http://b.example:81/s/KEY'",
      "from https://a.example to 'http://b.example:81'",
    ],
    ["bad URL http://[oops]/S3CRET here", "bad URL <url> here"],
    ["no URL here, not even ftp://host/path", "no URL here, not even ftp://host/path"],
  ])("rewrites %j", (text, expected) => {
    expect(withOriginsOnly(text)).toBe(expected)
  })
})

describe("sourceOf", () => {
  // Hosted MCP servers often carry the API key in the path (".../s/<key>/mcp").
  it("keeps the origin only: no credentials, path, query or fragment", () => {
    expect(sourceOf("https://u:p@example.com:8443/a/mcp?token=x#y")).toBe(
      "https://example.com:8443",
    )
    expect(sourceOf("https://mcp.example.com/api/mcp/s/c2stbGl2ZS1TRUNSRVQ/mcp")).toBe(
      "https://mcp.example.com",
    )
    expect(sourceOf("http://localhost:3000")).toBe("http://localhost:3000")
  })

  it("is one printable line for any path", () => {
    fc.assert(
      fc.property(fc.string({ unit: "binary" }), (pathname) => {
        expect(sourceOf(`http://localhost/${pathname}`)).toMatch(/^[\x20-\x7e]+$/)
      }),
    )
  })
})

describe("terminalText", () => {
  it("replaces escape sequences and other invisible characters, but keeps \\n", () => {
    expect(terminalText(`${char(0x1b)}[2Jok${char(0x07)}\nnext${char(0x202e)}`)).toBe(
      " [2Jok \nnext ",
    )
    expect(terminalText(`ok${char(0xe0041)}${char(0x3164)}`)).toBe("ok  ")
  })
})
