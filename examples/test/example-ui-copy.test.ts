import fs from "node:fs"
import path from "node:path"
import ts from "typescript"
import { describe, expect, it } from "vitest"
import { REPO_ROOT } from "./helpers/fitness-probe.js"
import designExemptions from "../../ratchets/design-exemptions.json"

/**
 * The UI the toolkit ships as reference (examples, the starter template) is
 * what consumers copy, so it follows the same rules as the toolkit's own
 * catalog (`packages/ui/src/locale/toolkit-messages.test.ts`) and kit gates.
 * brand-lint reads no TS/TSX strings; this walks the TypeScript AST of every
 * `.ts`/`.tsx` source under `examples/` and `templates/minimal-server/`.
 *
 * In any string literal, template text or JSX text:
 *  - no dash as a connector (" — ", " – "); a lone "—" placeholder for an
 *    empty value stays allowed;
 *  - "…", never "...";
 *  - no "(s)" plurals ("3 task(s)"): pick the word for the count;
 *  - "CIB seven", never "CIB Seven".
 * In JSX:
 *  - no raw error as a child (`{error.message}`, `{error}`): the raw reason
 *    belongs under an `ErrorState`'s `details`;
 *  - no typed glyph as an icon (`icon="✓"`): a Lucide component;
 *  - no hand-drawn `<svg strokeWidth=…>`: Lucide icons take the stroke the
 *    toolkit sets once;
 *  - no invented monogram (a `bg-primary` tile with one to three capitals)
 *    standing in for a product sign.
 * In calls:
 *  - no locale literal as the first argument of `Intl.*` or `toLocale*String`
 *    (`"en-US"`, `[]`): format in the widget's locale (`useLocale()`). A
 *    literal fallback inside a `catch` (an invalid tag) stays allowed.
 * In the reference widgets ({@link COPY_SCOPE}: the module widgets, the
 * host-portable `OrderStatusCard` and the starter's views, which every new
 * server starts from) every word comes from their en/de catalog
 * (`messages.ts`), never from the component: no JSX text with a letter, and
 * no letter-bearing literal as a rendered child, as a text attribute or
 * component prop (`title`, `aria-label`, `placeholder`, …) or as a text field
 * of an object (`label`, `title`, `description`, `actionHint`, …: KPI cells,
 * chips, toasts).
 */

const SCAN_ROOTS = ["examples", "templates/minimal-server"]
const SKIP_DIRS = new Set(["node_modules", "dist", "generated", "test", ".mcp-use"])

/** The reference widgets whose copy must come from a catalog (see the header). */
const COPY_SCOPE = [
  /^examples\/modules\/[^/]+\/widgets\/.+\.tsx$/,
  /^examples\/host-portability\/OrderStatusCard\.tsx$/,
  /^templates\/minimal-server\/views\/.+\.tsx$/,
]

/**
 * Files exempt from a rule, with the reason, from the `example-ui-copy`
 * section of `ratchets/design-exemptions.json`. SHRINK-ONLY: a stale entry
 * (the file is clean of that rule, or gone) fails below, and a new file or
 * rule fails `scripts/check-ratchets.mjs` against the merge-base.
 */
const EXEMPTIONS: Record<string, { rules: string[]; reason: string }> =
  designExemptions["example-ui-copy"]

function listSources(dir: string): string[] {
  const out: string[] = []
  for (const entry of fs.readdirSync(path.join(REPO_ROOT, dir), { withFileTypes: true })) {
    // A gate self-test's probe (fitness-gates.test.ts) comes and goes mid-run.
    if (SKIP_DIRS.has(entry.name) || entry.name.startsWith("__fitness-probe__")) continue
    const rel = path.join(dir, entry.name)
    if (entry.isDirectory()) out.push(...listSources(rel))
    else if (/\.tsx?$/.test(entry.name) && !/\.(test|d)\.tsx?$/.test(entry.name)) out.push(rel)
  }
  return out
}

interface Finding {
  file: string
  line: number
  rule: string
  text: string
}

const CONNECTOR_DASH = /(^|\s)[—–](\s|$)/
const TEXT_RULES: [rule: string, test: (text: string) => boolean][] = [
  ["connector-dash", (t) => t.trim() !== "—" && t.trim() !== "–" && CONNECTOR_DASH.test(t)],
  ["three-dots", (t) => t.includes("...")],
  ["s-plural", (t) => /\w\(s\)/.test(t)],
  ["cib-seven", (t) => /CIB Seven/i.test(t) && !t.includes("CIB seven")],
]

const RAW_ERROR_NAME = /^(error|err|errorMessage)$/
const MONOGRAM = /^[A-Z]{1,3}$/
const HAS_LETTER = /\p{L}/u

/** Attributes that are read or heard as text on any element. */
const TEXT_ATTRIBUTES = new Set([
  "title",
  "alt",
  "placeholder",
  "label",
  "aria-label",
  "aria-description",
  "aria-placeholder",
  "aria-roledescription",
  "aria-valuetext",
])

/** Component props that never carry user-facing copy. */
const NON_TEXT_PROPS = new Set([
  "className",
  "variant",
  "size",
  "type",
  "side",
  "role",
  "tone",
  "orientation",
  "align",
  "value",
  "defaultValue",
  "id",
  "key",
  "name",
  "htmlFor",
  "href",
  "target",
  "rel",
  "mode",
  "asChild",
  "dir",
])

/** Object fields that end up on screen (KPI cells, filter chips, toasts, headers). */
const TEXT_FIELDS = new Set([
  "label",
  "title",
  "description",
  "ariaLabel",
  "actionHint",
  "hint",
  "badge",
  "placeholder",
  "searchPlaceholder",
  "trend",
  "text",
])

function attr(node: ts.JsxOpeningLikeElement, name: string): ts.JsxAttribute | undefined {
  return node.attributes.properties.find(
    (p): p is ts.JsxAttribute => ts.isJsxAttribute(p) && p.name.getText() === name,
  )
}

function isRawError(expr: ts.Expression): boolean {
  if (ts.isPropertyAccessExpression(expr)) return expr.name.text === "message"
  return ts.isIdentifier(expr) && RAW_ERROR_NAME.test(expr.text)
}

function insideCatch(node: ts.Node): boolean {
  for (let p = node.parent; p; p = p.parent) if (ts.isCatchClause(p)) return true
  return false
}

const isLocaleCall = (callee: ts.Expression) =>
  (ts.isPropertyAccessExpression(callee) &&
    ts.isIdentifier(callee.expression) &&
    callee.expression.text === "Intl") ||
  (ts.isPropertyAccessExpression(callee) && /^toLocale(Date|Time)?String$/.test(callee.name.text))

/** The literal text pieces of an expression that would be rendered as text. */
function renderedLiterals(node: ts.Expression): string[] {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return [node.text]
  if (ts.isTemplateExpression(node)) {
    return [node.head.text, ...node.templateSpans.map((s) => s.literal.text)]
  }
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
    if (op === ts.SyntaxKind.PlusToken) {
      return [...renderedLiterals(node.left), ...renderedLiterals(node.right)]
    }
  }
  return []
}

/** Whether a JSX attribute is rendered text: a text attribute, or a component's text prop. */
function isTextAttribute(node: ts.JsxAttribute): boolean {
  const name = node.name.getText()
  if (TEXT_ATTRIBUTES.has(name)) return true
  const tag = node.parent.parent.tagName.getText()
  if (/^[a-z]/.test(tag)) return false
  return (
    !NON_TEXT_PROPS.has(name) &&
    !name.endsWith("ClassName") &&
    !name.startsWith("data-") &&
    !name.startsWith("aria-")
  )
}

/** Letter-bearing literals the reference widgets must take from their catalog. */
function hardcodedCopy(node: ts.Node): string[] {
  const lettered = (texts: string[]) => texts.filter((t) => HAS_LETTER.test(t))
  if (ts.isJsxText(node)) return lettered([node.text])
  if (ts.isJsxExpression(node) && node.expression) {
    const parent = node.parent
    const rendered =
      ts.isJsxElement(parent) ||
      ts.isJsxFragment(parent) ||
      (ts.isJsxAttribute(parent) && isTextAttribute(parent))
    return rendered ? lettered(renderedLiterals(node.expression)) : []
  }
  if (ts.isJsxAttribute(node) && node.initializer && ts.isStringLiteral(node.initializer)) {
    return isTextAttribute(node) ? lettered([node.initializer.text]) : []
  }
  if (ts.isPropertyAssignment(node) && TEXT_FIELDS.has(node.name.getText())) {
    return lettered(renderedLiterals(node.initializer))
  }
  return []
}

function scan(file: string, source: string): Finding[] {
  const kind = file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS
  const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, kind)
  const copyScope = COPY_SCOPE.some((re) => re.test(file))
  const findings: Finding[] = []
  const add = (node: ts.Node, rule: string, text: string) =>
    findings.push({
      file,
      line: sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1,
      rule,
      text: text.replace(/\s+/g, " ").trim().slice(0, 80),
    })
  const checkText = (node: ts.Node, text: string) => {
    for (const [rule, test] of TEXT_RULES) if (test(text)) add(node, rule, text)
  }

  const visit = (node: ts.Node): void => {
    if (copyScope) for (const text of hardcodedCopy(node)) add(node, "hardcoded-copy", text)
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      checkText(node, node.text)
    } else if (ts.isTemplateExpression(node)) {
      checkText(node, [node.head.text, ...node.templateSpans.map((s) => s.literal.text)].join("·"))
    } else if (ts.isJsxText(node)) {
      checkText(node, node.text)
    } else if (ts.isJsxExpression(node) && node.expression && ts.isJsxElement(node.parent)) {
      if (isRawError(node.expression)) add(node, "raw-error-as-text", node.getText(sf))
    } else if (ts.isJsxSelfClosingElement(node) || ts.isJsxOpeningElement(node)) {
      const icon = attr(node, "icon")?.initializer
      if (icon && ts.isStringLiteral(icon)) add(node, "typed-icon", icon.text)
      if (node.tagName.getText() === "svg" && attr(node, "strokeWidth")) {
        add(node, "svg-stroke", node.getText(sf))
      }
      const cls = attr(node, "className")?.initializer
      const parent = node.parent
      if (
        cls &&
        ts.isStringLiteral(cls) &&
        /\bbg-primary\b/.test(cls.text) &&
        ts.isJsxElement(parent)
      ) {
        const text = parent.children.map((c) => (ts.isJsxText(c) ? c.text : "\u0000")).join("")
        if (MONOGRAM.test(text.trim())) add(node, "monogram", text.trim())
      }
    } else if (ts.isCallExpression(node) || ts.isNewExpression(node)) {
      const first = node.arguments?.[0]
      if (
        first &&
        isLocaleCall(node.expression) &&
        (ts.isStringLiteral(first) || ts.isArrayLiteralExpression(first)) &&
        !insideCatch(node)
      ) {
        add(node, "locale-literal", node.getText(sf))
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(sf)
  return findings
}

const files = SCAN_ROOTS.flatMap(listSources).sort()
const allFindings = () =>
  files.flatMap((file) => scan(file, fs.readFileSync(path.join(REPO_ROOT, file), "utf8")))
const exempt = (f: Finding) => EXEMPTIONS[f.file]?.rules.includes(f.rule) ?? false

describe("example and template UI copy", () => {
  it("scans the reference widgets, their catalogs, the plugins and the harness apps", () => {
    for (const expected of [
      "examples/modules/tasks/widgets/TasksBoard.tsx",
      "examples/modules/tasks/widgets/messages.ts",
      "examples/modules/orders/plugin.ts",
      "examples/host-portability/OrderStatusCard.tsx",
      "examples/widget-playground/App.tsx",
      "examples/widget-playground/stories.ts",
      "templates/minimal-server/views/shared/TaskListCard.tsx",
    ]) {
      expect(files).toContain(expected)
    }
    const scoped = files.filter((f) => COPY_SCOPE.some((re) => re.test(f)))
    expect(scoped.length).toBeGreaterThanOrEqual(7)
    expect(scoped).toContain("templates/minimal-server/views/shared/TaskListCard.tsx")
  })

  it("follows the copy, catalog, error, icon and locale rules", () => {
    expect(
      allFindings()
        .filter((f) => !exempt(f))
        .map((f) => `${f.file}:${f.line} ${f.rule} "${f.text}"`),
      "Periods or colons instead of dash connectors, '…' not '...', a word per count, " +
        "'CIB seven'; reference-widget words in their messages.ts catalog; raw errors under " +
        "ErrorState details; Lucide icons; the widget's locale.",
    ).toEqual([])
  })

  it("keeps the exemptions free of stale entries (shrink-only)", () => {
    const findings = allFindings()
    for (const [file, { rules, reason }] of Object.entries(EXEMPTIONS)) {
      expect(reason, file).toBeTruthy()
      for (const rule of rules) {
        expect(
          findings.some((f) => f.file === file && f.rule === rule),
          `${file} no longer breaks "${rule}": remove it from ratchets/design-exemptions.json`,
        ).toBe(true)
      }
    }
  })
})

describe("example UI copy gate fires (self-test)", () => {
  const rulesOf = (source: string, file = "probe.tsx") => scan(file, source).map((f) => f.rule)

  it("flags the text rules in JSX text, literals and template text", () => {
    expect(rulesOf("const a = <p>Valid JSON — preview reflects it.</p>")).toContain(
      "connector-dash",
    )
    expect(rulesOf("const t = `Orders – ${name}`", "probe.ts")).toContain("connector-dash")
    expect(rulesOf('const l = "Loading..."', "probe.ts")).toContain("three-dots")
    expect(rulesOf("const a = <span>{n} task(s)</span>")).toContain("s-plural")
    expect(rulesOf('const b = "Routing CIB Seven engines"')).toContain("cib-seven")
    expect(rulesOf('const ok = <p>{since || "—"} · Loading… · CIB seven · 3 tasks</p>')).toEqual([])
  })

  it("flags raw errors as text, typed icons, hand-drawn strokes and monograms", () => {
    expect(rulesOf("const a = <p>{query.error.message}</p>")).toContain("raw-error-as-text")
    expect(rulesOf("const a = <div>{error}</div>")).toContain("raw-error-as-text")
    expect(rulesOf("const a = <ErrorState title={t} details={error.message} />")).toEqual([])
    expect(rulesOf('const a = <WidgetHeader icon="✓" title="x" />')).toContain("typed-icon")
    expect(rulesOf("const a = <WidgetHeader icon={<ListChecks />} title={t} />")).toEqual([])
    expect(rulesOf('const a = <svg strokeWidth="2" />')).toContain("svg-stroke")
    expect(rulesOf('const a = <div className="bg-primary size-7">UI</div>')).toContain("monogram")
    expect(rulesOf('const a = <div className="bg-primary">Save</div>')).toEqual([])
  })

  it("flags locale literals in Intl and toLocale calls, not a fallback in catch", () => {
    expect(rulesOf('new Intl.NumberFormat("en-US", {}).format(1)')).toContain("locale-literal")
    expect(rulesOf("d.toLocaleDateString([], {})")).toContain("locale-literal")
    expect(rulesOf("new Intl.NumberFormat(locale).format(1)")).toEqual([])
    expect(rulesOf('try { f(locale) } catch { new Intl.NumberFormat("en").format(1) }')).toEqual([])
  })

  it("flags hard-coded copy in the reference widgets only", () => {
    const widget = "examples/modules/demo/widgets/Probe.tsx"
    const copy = (source: string) =>
      scan(widget, source)
        .filter((f) => f.rule === "hardcoded-copy")
        .map((f) => f.text)
    expect(
      copy(`
        const A = () => <p>Loading tasks…</p>
        const B = ({ x }: P) => <span>{x ? "Refreshing…" : "Refresh"}</span>
        const C = () => <Button aria-label="Close" title={"Shut"} variant="outline" size="sm" />
        const D = () => <ErrorState title="Oops" description={\`Try \${n} again\`} />
        const E = () => <KpiGrid cells={[{ label: "Total", value: n }]} header={{ label: "Status" }} />
        toast.show({ tone: "success", title: "Saved" })
      `),
    ).toEqual([
      "Loading tasks…",
      "Refreshing…",
      "Refresh",
      "Close",
      "Shut",
      "Oops",
      "Try",
      "again",
      "Total",
      "Status",
      "Saved",
    ])
    expect(
      copy(`
        const OK = ({ text, n }: P) => (
          <Card role="status" aria-label={text.loading} data-icon="inline-start" className="p-4">
            <Badge variant="outline">{text.status.open}</Badge> · {n}
            <KpiGrid cells={[{ label: text.total, value: count(n), tone: "info" }]} />
          </Card>
        )
      `),
    ).toEqual([])
    // The starter's views are reference widgets too: a new server copies them.
    expect(
      scan("templates/minimal-server/views/shared/Probe.tsx", "const A = () => <p>Tasks</p>").map(
        (f) => f.rule,
      ),
    ).toEqual(["hardcoded-copy"])
    // Outside the reference widgets (a harness, the template's server code) the rule is off.
    expect(scan("examples/widget-playground/App.tsx", "const A = () => <p>Brand</p>")).toEqual([])
    expect(scan("templates/minimal-server/src/Probe.tsx", "const A = () => <p>Brand</p>")).toEqual(
      [],
    )
  })
})
