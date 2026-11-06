/**
 * Untrusted text on its way into a generated comment or onto a terminal:
 * descriptions from the server's tools/list, the configured server URL.
 */

const LINE_BREAKS = /\r\n?|[\u2028\u2029]/g

/**
 * Controls (C0 incl. line breaks, DEL, C1), format characters (bidirectional
 * overrides, zero-width characters, Unicode tags), every other default-ignorable
 * code point (Hangul fillers, variation selectors, the soft hyphen), line and
 * paragraph separators and lone surrogates: invisible, and able to reorder,
 * hide or (as terminal escape sequences) act on text. Matched per code point.
 */
const INVISIBLE = /[\p{Cc}\p{Cf}\p{Cs}\p{Zl}\p{Zp}\p{Default_Ignorable_Code_Point}]/gu

/**
 * Writes every invisible character except `\n` as `\u` escapes, one per UTF-16
 * unit (a surrogate pair beyond the BMP, valid in JSON and JavaScript alike).
 * For generated code whose only such characters sit inside string literals,
 * where the escape keeps the value and makes the character visible ("Trojan
 * Source", CVE-2021-42574).
 */
export function escapeInvisible(code: string): string {
  return code.replace(INVISIBLE, (char) => {
    if (char === "\n") return char
    let escaped = ""
    for (let i = 0; i < char.length; i++) {
      escaped += `\\u${char.charCodeAt(i).toString(16).padStart(4, "0")}`
    }
    return escaped
  })
}

/**
 * Text that may sit inside a block comment: line breaks unified to `\n`, tabs
 * as spaces, other invisible characters dropped, and every `*` + `/` split
 * by a backslash, so nothing can close the comment.
 */
export function commentText(text: string): string {
  return text
    .replace(LINE_BREAKS, "\n")
    .replaceAll("\t", " ")
    .replace(INVISIBLE, (char) => (char === "\n" ? char : ""))
    .replaceAll("*/", "*\\/")
}

/**
 * A JSDoc block for `text` at `indentation`, ending in a newline; "" when the
 * text is not a string or has nothing to show. A single line goes inline,
 * unless it starts with `@`: TypeScript reads the last line of a block comment
 * as a directive, so `/** @ts-ignore *\/` would act on the generated line below.
 */
export function docComment(text: unknown, indentation = ""): string {
  if (typeof text !== "string") return ""
  const lines = commentText(text)
    .split("\n")
    .map((part) => part.trimEnd())
  while (lines[0] === "") lines.shift()
  while (lines.at(-1) === "") lines.pop()
  const [first] = lines
  if (first === undefined) return ""
  if (lines.length === 1) {
    const line = first.trim()
    if (!line.startsWith("@")) return `${indentation}/** ${line} */\n`
    lines[0] = line
  }
  const body = lines.map((part) => (part === "" ? `${indentation} *` : `${indentation} * ${part}`))
  return [`${indentation}/**`, ...body, `${indentation} */`].join("\n") + "\n"
}

/**
 * The server as the generated files' `Source:` header and the CLI's messages
 * name it: the URL's origin only. Never its credentials, query or fragment,
 * nor its path, where hosted MCP servers often carry an API key.
 */
export function sourceOf(url: string): string {
  return new URL(url).origin
}

const URL_IN_TEXT = /\bhttps?:\/\/[^\s"'<>]+/gi

/**
 * Text that may quote a URL (an SDK error naming a redirect target) with every
 * URL in it cut down to its origin, as {@link sourceOf} names a server.
 */
export function withOriginsOnly(text: string): string {
  return text.replace(URL_IN_TEXT, (found) => (URL.canParse(found) ? sourceOf(found) : "<url>"))
}

/** Server text for a terminal: every invisible character but `\n` becomes a space. */
export function terminalText(text: string): string {
  return text.replace(INVISIBLE, (char) => (char === "\n" ? char : " "))
}

/** The longest message the CLI prints; a server's error page can be any size. */
const MAX_LOG_LENGTH = 2000

/**
 * A message for stderr that can carry the server's text (an HTTP error body, tool names, schema
 * errors, what the MCP client SDK prints about a tool): invisible characters become spaces, the
 * length is capped, and every line but the first is marked as a continuation, so no server text
 * starts a line of the log (a GitHub Actions `::error` command, a fake "up to date").
 */
export function logText(message: string): string {
  const capped =
    message.length > MAX_LOG_LENGTH ? `${message.slice(0, MAX_LOG_LENGTH)}... (truncated)` : message
  const [first, ...rest] = capped.split(/\r\n?|\n/).map((line) => terminalText(line).trimEnd())
  return [`mcp-tool-codegen: ${first}`, ...rest.map((line) => `  | ${line.trimStart()}`)].join("\n")
}
