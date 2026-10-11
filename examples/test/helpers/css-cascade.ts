/**
 * Just enough selector maths to order a cascade the way the browser does:
 * selector lists, specificity, the subject compound of a selector and the
 * blocks the page root takes its custom properties from (specificity first,
 * then source order). It serves the docs theme test, which must see that a
 * later `:root` block outranks an earlier `.dark` one, and whether a
 * VitePress focus rule outranks the docs' focus ring.
 */
import type { CssBlock } from "./css-colour.js"

export type Specificity = [number, number, number]

const ZERO: Specificity = [0, 0, 0]
const ID: Specificity = [1, 0, 0]
const CLASS: Specificity = [0, 1, 0]
const TYPE: Specificity = [0, 0, 1]

/** Pseudo-elements CSS 2 spelled with one colon. */
const LEGACY_PSEUDO_ELEMENTS = new Set(["before", "after", "first-line", "first-letter"])
/** Pseudo-classes that take the specificity of their most specific argument. */
const FORWARDING = new Set(["is", "not", "has", "matches"])

const add = (x: Specificity, y: Specificity): Specificity => [x[0] + y[0], x[1] + y[1], x[2] + y[2]]

/** Negative, zero or positive as `x` is less, as or more specific than `y`. */
export const compareSpecificity = (x: Specificity, y: Specificity): number =>
  x[0] - y[0] || x[1] - y[1] || x[2] - y[2]

export const maxSpecificity = (specs: Specificity[]): Specificity =>
  specs.reduce((top, s) => (compareSpecificity(s, top) > 0 ? s : top), ZERO)

/** Split at top-level occurrences of `at` (outside parentheses and brackets). */
function splitTopLevel(text: string, at: (ch: string) => boolean): string[] {
  const out: string[] = []
  let depth = 0
  let current = ""
  for (const ch of text) {
    if (ch === "(" || ch === "[") depth++
    if (ch === ")" || ch === "]") depth--
    if (depth === 0 && at(ch)) {
      out.push(current)
      current = ""
    } else {
      current += ch
    }
  }
  out.push(current)
  return out.map((s) => s.trim()).filter(Boolean)
}

/** `a, b:is(c, d)` → `["a", "b:is(c, d)"]`. */
export const splitSelectors = (list: string): string[] => splitTopLevel(list, (ch) => ch === ",")

/** The compound a selector styles: `.a > b.c:focus` → `b.c:focus`. */
export const subjectCompound = (selector: string): string =>
  splitTopLevel(selector, (ch) => /[\s>+~]/.test(ch)).pop() ?? ""

/** `b.c:focus` → `["b", ".c", ":focus"]`. */
export const simpleSelectors = (compound: string): string[] =>
  compound.match(/::?[\w-]+(?:\((?:[^()]|\([^()]*\))*\))?|[.#][\w-]+|\[[^\]]*\]|\*|[\w-]+/g) ?? []

/** The index of the parenthesis that closes the one at `open`. */
function closing(text: string, open: number): number {
  let depth = 0
  for (let i = open; i < text.length; i++) {
    if (text[i] === "(") depth++
    if (text[i] === ")" && --depth === 0) return i
  }
  throw new Error(`unbalanced parentheses in "${text}"`)
}

/** Specificity of one pseudo-class or pseudo-element (Selectors 4). */
function pseudo(colons: string, name: string, args: string | null): Specificity {
  if (colons === "::" || LEGACY_PSEUDO_ELEMENTS.has(name)) return TYPE
  if (name === "where") return ZERO
  if (args !== null && FORWARDING.has(name)) {
    return maxSpecificity(splitSelectors(args).map(specificity))
  }
  return CLASS
}

/** The specificity of one complex selector (no list). */
export function specificity(selector: string): Specificity {
  let spec = ZERO
  let i = 0
  while (i < selector.length) {
    const rest = selector.slice(i)
    const pseudoMatch = /^(::?)([\w-]+)/.exec(rest)
    const named = /^([.#]?)[\w-]+/.exec(rest)
    if (pseudoMatch) {
      i += pseudoMatch[0].length
      let args: string | null = null
      if (selector[i] === "(") {
        const end = closing(selector, i)
        args = selector.slice(i + 1, end)
        i = end + 1
      }
      const [, colons = ":", name = ""] = pseudoMatch
      spec = add(spec, pseudo(colons, name.toLowerCase(), args))
    } else if (rest.startsWith("[")) {
      spec = add(spec, CLASS)
      i = selector.indexOf("]", i) + 1
    } else if (named) {
      spec = add(spec, named[1] === "#" ? ID : named[1] === "." ? CLASS : TYPE)
      i += named[0].length
    } else {
      i++ // combinators, whitespace, `*`
    }
  }
  return spec
}

/**
 * The blocks the page root (`<html>`) takes its custom properties from, in
 * cascade order, lowest priority first: the blocks whose selector list holds
 * a selector in `matching`, ordered by that selector's specificity, then by
 * stylesheet (`sheets` in load order) and position in it. A `:root` block
 * after a `.dark` block of the same sheet therefore wins on a dark page, as
 * it does in the browser.
 */
export function rootCascade(sheets: CssBlock[][], matching: ReadonlySet<string>): CssBlock[] {
  const hits = sheets.flatMap((blocks, sheet) =>
    blocks.flatMap((block) => {
      const specs = splitSelectors(block.selector)
        .filter((s) => matching.has(s))
        .map(specificity)
      return specs.length === 0 ? [] : [{ block, sheet, spec: maxSpecificity(specs) }]
    }),
  )
  hits.sort(
    (x, y) =>
      compareSpecificity(x.spec, y.spec) || x.sheet - y.sheet || x.block.index - y.block.index,
  )
  return hits.map((hit) => hit.block)
}
