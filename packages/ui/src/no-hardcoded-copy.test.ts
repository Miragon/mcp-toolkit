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
 *
 * And in every `.ts`/`.tsx` source, the feedback copy rule: the sentences of
 * a feedback surface carry catalog text only, never a literal and never a raw
 * error. Feedback surfaces are the `title`/`description` of a
 * `<x>.show({ … })` toast call and of `ErrorState`/`EmptyState`, and the
 * content of an inline alert (any element with `role="alert"` or
 * `role="status"`, and the `Alert` primitive). A raw error is `e.message`,
 * `String(e)`, an `errorText(e)` helper, or a value named as one once it sits
 * in state or props (`error`, `err`, `reason`, `saveError`, `callErrorReason`
 * …). The raw reason belongs in the console or under an ErrorState's
 * "Details", not in a sentence the user reads.
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

const TS_SOURCES = import.meta.glob(["./**/*.ts", "!./**/*.test.ts", "!./**/*.d.ts"], {
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

/** Calls that turn a caught error into text. */
const RAW_ERROR_CALLS = new Set(["errorText", "errorMessage", "String"])

/**
 * Names a caught error (or its text) takes once it is held in state or passed
 * as a prop: `e`, `err`, `error`, `reason`, `cause`, or a name ending in
 * `Error`/`Reason` (`saveError`, `callErrorReason`). Flags (`isError`,
 * `hasError`, `showError`) are not errors.
 */
const RAW_ERROR_NAME = /^(?:e|err|error|reason|cause)$|^(?!(?:is|has|show)[A-Z]).*(?:Error|Reason)$/

/**
 * Whether an expression reads a raw error: `.message`/`.stack`, a raw-error
 * call, or a reference to a value named as an error. Declarations, property
 * names, types and the attributes of nested JSX are not reads; the text
 * children of nested JSX are.
 */
function readsRawError(node: ts.Node): boolean {
  if (ts.isTypeNode(node) || ts.isJsxAttributes(node) || ts.isJsxSelfClosingElement(node)) {
    return false
  }
  if (ts.isPropertyAccessExpression(node)) {
    if (node.name.text === "message" || node.name.text === "stack") return true
    return readsRawError(node.expression)
  }
  if (
    ts.isCallExpression(node) &&
    ts.isIdentifier(node.expression) &&
    RAW_ERROR_CALLS.has(node.expression.text)
  ) {
    return true
  }
  if (ts.isIdentifier(node)) return RAW_ERROR_NAME.test(node.text)
  if (ts.isJsxElement(node) || ts.isJsxFragment(node)) return node.children.some(readsRawError)
  if (ts.isParameter(node) || ts.isBindingElement(node) || ts.isVariableDeclaration(node)) {
    return node.initializer ? readsRawError(node.initializer) : false
  }
  if (ts.isPropertyAssignment(node)) return readsRawError(node.initializer)
  return ts.forEachChild(node, readsRawError) ?? false
}

/** `title`/`description` of `<x>.show({ … })` calls that are literals or raw errors. */
function toastCopyLeaks(file: string, source: string): string[] {
  const kind = file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS
  const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, kind)
  const found: string[] = []
  const visit = (node: ts.Node) => {
    const options = ts.isCallExpression(node) ? node.arguments[0] : undefined
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      node.expression.name.text === "show" &&
      options &&
      ts.isObjectLiteralExpression(options)
    ) {
      for (const prop of options.properties) {
        if (!ts.isPropertyAssignment(prop)) continue
        const key = prop.name.getText(sf)
        if (key !== "title" && key !== "description") continue
        const literal = renderedLiterals(prop.initializer).some((lit) =>
          HAS_LETTER.test(literalText(lit)),
        )
        if (literal || readsRawError(prop.initializer)) {
          const { line } = sf.getLineAndCharacterOfPosition(prop.getStart(sf))
          found.push(`${file}:${line + 1}: ${key}: ${prop.initializer.getText(sf)}`)
        }
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(sf)
  return found
}

/** Feedback components whose `title`/`description` are sentences the user reads. */
const FEEDBACK_COMPONENTS = new Set(["ErrorState", "EmptyState"])
const FEEDBACK_PROPS = new Set(["title", "description"])
/** Components that are an inline alert by themselves (their role is built in). */
const ALERT_COMPONENTS = new Set(["Alert"])

function jsxTag(node: ts.JsxElement | ts.JsxSelfClosingElement): string {
  return (ts.isJsxElement(node) ? node.openingElement : node).tagName.getText()
}

/** Whether a JSX element is an inline alert: `role="alert"|"status"` or the `Alert` primitive. */
function isInlineAlert(node: ts.JsxElement): boolean {
  if (ALERT_COMPONENTS.has(jsxTag(node))) return true
  return node.openingElement.attributes.properties.some(
    (attr) =>
      ts.isJsxAttribute(attr) &&
      attr.name.getText() === "role" &&
      attr.initializer !== undefined &&
      ts.isStringLiteral(attr.initializer) &&
      (attr.initializer.text === "alert" || attr.initializer.text === "status"),
  )
}

/**
 * Raw errors in the JSX feedback surfaces: the `title`/`description` of an
 * ErrorState or EmptyState, and the content of an inline alert. (Literals in
 * them are the hard-coded-copy gate's job.)
 */
function feedbackCopyLeaks(file: string, source: string): string[] {
  const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const found: string[] = []
  const report = (node: ts.Node, where: string) => {
    const { line } = sf.getLineAndCharacterOfPosition(node.getStart(sf))
    found.push(`${file}:${line + 1}: ${where}: ${node.getText(sf).replace(/\s+/g, " ")}`)
  }
  const visit = (node: ts.Node) => {
    if (
      ts.isJsxAttribute(node) &&
      node.initializer &&
      FEEDBACK_PROPS.has(node.name.getText()) &&
      FEEDBACK_COMPONENTS.has(tagName(node)) &&
      readsRawError(node.initializer)
    ) {
      report(node.initializer, `${tagName(node)} ${node.name.getText()}`)
    }
    if (ts.isJsxElement(node) && isInlineAlert(node)) {
      for (const child of node.children) {
        if (readsRawError(child)) report(child, `${jsxTag(node)} alert content`)
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(sf)
  return found
}

describe("feedback copy comes from the catalog, never from a raw error", () => {
  it("scans the feedback surfaces", () => {
    const tsx = Object.entries(SOURCES)
    expect(tsx.filter(([, src]) => /<(ErrorState|EmptyState)\b/.test(src)).length).toBeGreaterThan(
      3,
    )
    expect(tsx.filter(([, src]) => /role="(alert|status)"/.test(src)).length).toBeGreaterThan(2)
  })

  it("finds no raw error in an ErrorState/EmptyState title or description, or in an inline alert", () => {
    const offenders = Object.entries(SOURCES).flatMap(([file, source]) =>
      feedbackCopyLeaks(file, source),
    )
    expect(
      offenders,
      "Say what happened and what to do in catalog words (locale/messages-*.ts); pass the raw reason as an ErrorState's `details` (or log it with console.warn).",
    ).toEqual([])
  })

  it("catches the shapes it promises to catch (gate self-test)", () => {
    const src = `
      export const A = ({ L, e }: P) => <ErrorState title={L.x} description={e.message} />
      export const B = ({ error }: P) => <ErrorState title={error} details={error} />
      export const C = ({ L, err }: P) => <EmptyState title={L.empty} description={String(err)} />
      export const D = ({ L, error }: P) => (
        <div role="alert">
          <span>{L.saveError}:</span> {error}
        </div>
      )
      export const E = ({ L, name, refreshError }: P) => (
        <div role="status">
          <p>{L.catalogueError}</p>
          <p><span>{name}</span>: {refreshError}</p>
        </div>
      )
      export const F = ({ reason }: P) => <Alert><AlertDescription>{reason}</AlertDescription></Alert>
      export const G = ({ L, error, isError }: P) => (
        <>
          <ErrorState title={L.saveError} description={L.saveErrorHint} details={error} />
          {isError && <p role="alert">{L.failed}</p>}
          <p role="status">{L.cancelled}</p>
          <div role="alert">{items.map(({ id, reason }) => <li key={id}>{id}</li>)}</div>
          <ErrorState title={human?.title ?? L.errorTitle} description={(x as ViewError).hint} />
        </>
      )
    `
    expect(
      feedbackCopyLeaks("self.tsx", src).map((s) => s.replace(/^self\.tsx:\d+: /, "")),
    ).toEqual([
      "ErrorState description: {e.message}",
      "ErrorState title: {error}",
      "EmptyState description: {String(err)}",
      "div alert content: {error}",
      "div alert content: <p><span>{name}</span>: {refreshError}</p>",
      "Alert alert content: <AlertDescription>{reason}</AlertDescription>",
    ])
  })
})

describe("toast copy comes from the catalog, never from a raw error", () => {
  it("scans the toast call sites", () => {
    const all = { ...SOURCES, ...TS_SOURCES }
    expect(Object.keys(all)).toContain("./app/mcp-app-view.tsx")
    expect(Object.values(all).filter((src) => /\.show\(\{/.test(src)).length).toBeGreaterThan(1)
  })

  it("finds no literal and no raw error in a toast's title or description", () => {
    const offenders = Object.entries({ ...SOURCES, ...TS_SOURCES }).flatMap(([file, source]) =>
      toastCopyLeaks(file, source),
    )
    expect(
      offenders,
      "Say what happened and what to do in catalog words (locale/messages-*.ts); log the raw reason (console.warn) or show it under an ErrorState's Details.",
    ).toEqual([])
  })

  it("catches the shapes it promises to catch (gate self-test)", () => {
    const src = `
      toast.show({ tone: "danger", title: "Refresh failed", description: errorText(e) })
      toast.show({ title: L.refreshFailed, description: e.message })
      toast.show({ title: L.x, description: String(err) })
      toast.show({ title: L.refreshFailed, description: refreshError })
      toast.show({ tone: "success", title: L.saved(name) })
      toast.show({ title: L.refreshFailed, description: L.refreshFailedHint })
      toast.show({ title: L.failed, description: isError ? L.a : L.b })
      other.show(options)
    `
    expect(toastCopyLeaks("self.ts", src).map((s) => s.replace(/^self\.ts:\d+: /, ""))).toEqual([
      'title: "Refresh failed"',
      "description: errorText(e)",
      "description: e.message",
      "description: String(err)",
      "description: refreshError",
    ])
  })
})

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
