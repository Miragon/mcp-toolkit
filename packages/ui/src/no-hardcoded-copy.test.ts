import ts from "typescript"
import { describe, expect, it } from "vitest"
import { TEXT_ATTRIBUTES } from "./render-scan.js"

/**
 * Static half of the i18n guard (the render half is `i18n-coverage.test.tsx`):
 * no toolkit component may carry user-facing copy in its source. Every word a
 * user reads or hears comes from the locale catalog (`locale/messages-*.ts`)
 * or from the consumer's props. This catches what an SSR render cannot reach —
 * portal content (dialogs, sheets, select menus) and branches the fixtures do
 * not hit.
 *
 * Flagged in every `.tsx` under src (tests and the render-case fixtures
 * excepted):
 *  - JSX text containing a letter;
 *  - a string literal with a letter rendered as a child (`{"…"}`, `{x ? "a" : "b"}`,
 *    `{x && "a"}`, template literals);
 *  - such a literal in a text attribute of a DOM element (aria-label, title,
 *    placeholder, alt, …), or in any prop of a component except the
 *    non-text props below (variants, sizes, roles, ids, …).
 */

declare global {
  interface ImportMeta {
    glob(
      pattern: string | string[],
      options: { query: "?raw"; import: "default"; eager: true },
    ): Record<string, string>
  }
}

const SOURCES = import.meta.glob(["./**/*.tsx", "!./**/*.test.tsx", "!./render-cases*.tsx"], {
  query: "?raw",
  import: "default",
  eager: true,
})

/** Component props that never carry user-facing copy. */
const NON_TEXT_PROPS = new Set([
  "className",
  "variant",
  "size",
  "type",
  "side",
  "role",
  "tone",
  "iconTone",
  "titleAs",
  "titleMode",
  "orientation",
  "align",
  "value",
  "defaultValue",
  "id",
  "name",
  "htmlFor",
  "href",
  "target",
  "rel",
  "mode",
  "asChild",
  "dir",
])

const HAS_LETTER = /\p{L}/u
const TEXT_ATTRS = new Set<string>(TEXT_ATTRIBUTES)

/** String literals in an expression that would end up rendered as text. */
function renderedLiterals(node: ts.Expression): ts.Node[] {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return [node]
  if (ts.isTemplateExpression(node)) return [node.head, ...node.templateSpans.map((s) => s.literal)]
  if (ts.isParenthesizedExpression(node) || ts.isAsExpression(node)) {
    return renderedLiterals(node.expression)
  }
  if (ts.isConditionalExpression(node)) {
    return [...renderedLiterals(node.whenTrue), ...renderedLiterals(node.whenFalse)]
  }
  if (ts.isBinaryExpression(node)) {
    const op = node.operatorToken.kind
    if (op === ts.SyntaxKind.AmpersandAmpersandToken) return renderedLiterals(node.right)
    if (op === ts.SyntaxKind.BarBarToken || op === ts.SyntaxKind.QuestionQuestionToken) {
      return [...renderedLiterals(node.left), ...renderedLiterals(node.right)]
    }
  }
  return []
}

function literalText(node: ts.Node): string {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text
  if (ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node)) {
    return node.text
  }
  return ""
}

function tagName(attr: ts.JsxAttribute): string {
  const opening = attr.parent.parent
  return opening.tagName.getText()
}

/**
 * Whether an attribute is rendered text: the text attributes on any element;
 * on a component additionally every prop that is not a known non-text prop.
 */
function isTextAttribute(attr: ts.JsxAttribute): boolean {
  const name = attr.name.getText()
  if (TEXT_ATTRS.has(name)) return true
  if (/^[a-z]/.test(tagName(attr))) return false
  if (name.endsWith("ClassName")) return false
  return !NON_TEXT_PROPS.has(name) && !name.startsWith("data-") && !name.startsWith("aria-")
}

function hardcodedCopy(file: string, source: string): string[] {
  const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const found: string[] = []
  const report = (node: ts.Node, text: string) => {
    const { line } = sf.getLineAndCharacterOfPosition(node.getStart(sf))
    found.push(`${file}:${line + 1}: "${text.trim().replace(/\s+/g, " ")}"`)
  }
  const visit = (node: ts.Node) => {
    if (ts.isJsxText(node) && HAS_LETTER.test(node.text)) report(node, node.text)
    if (ts.isJsxExpression(node) && node.expression) {
      const parent = node.parent
      const rendered =
        ts.isJsxElement(parent) ||
        ts.isJsxFragment(parent) ||
        (ts.isJsxAttribute(parent) && isTextAttribute(parent))
      if (rendered) {
        for (const lit of renderedLiterals(node.expression)) {
          const text = literalText(lit)
          if (HAS_LETTER.test(text)) report(lit, text)
        }
      }
    }
    if (
      ts.isJsxAttribute(node) &&
      node.initializer &&
      ts.isStringLiteral(node.initializer) &&
      HAS_LETTER.test(node.initializer.text) &&
      isTextAttribute(node)
    ) {
      report(node.initializer, node.initializer.text)
    }
    ts.forEachChild(node, visit)
  }
  visit(sf)
  return found
}

describe("no hard-coded copy in toolkit components", () => {
  it("scans the component sources", () => {
    // A broken glob would make the gate vacuous.
    expect(Object.keys(SOURCES).length).toBeGreaterThan(40)
    expect(Object.keys(SOURCES)).toContain("./app/mcp-app-view-chrome.tsx")
    expect(Object.keys(SOURCES)).toContain("./primitives/dialog.tsx")
  })

  it("finds every user-facing word in the catalog or in props, never in the source", () => {
    const offenders = Object.entries(SOURCES).flatMap(([file, source]) =>
      hardcodedCopy(file, source),
    )
    expect(
      offenders,
      "Move these strings into the toolkit catalog (locale/message-types.ts + messages-en.ts + messages-de.ts) and read them via useToolkitMessages() or the component's labels.",
    ).toEqual([])
  })

  it("catches the shapes it promises to catch (gate self-test)", () => {
    const src = `
      export const A = () => <p>Loading…</p>
      export const B = ({ x }: { x: boolean }) => <span>{x ? "Load more" : "…"}</span>
      export const C = () => <button aria-label="Close" title={"Shut"} className="text-sm" />
      export const D = () => <ErrorState title="Oops" variant="inline" data-slot="x" />
      export const E = ({ n }: { n: number }) => <i>{\`\${n} rows\`}</i>
      export const F = ({ ok }: { ok: boolean }) => <b>{ok && "Done"}{ok === Boolean("x") && 1}</b>
      export const G = ({ L }: { L: { a: string } }) => <p title={L.a}>{L.a} · {"→"}</p>
    `
    expect(hardcodedCopy("self.tsx", src).map((s) => s.replace(/^self\.tsx:\d+: /, ""))).toEqual([
      '"Loading…"',
      '"Load more"',
      '"Close"',
      '"Shut"',
      '"Oops"',
      '"rows"',
      '"Done"',
    ])
  })
})
