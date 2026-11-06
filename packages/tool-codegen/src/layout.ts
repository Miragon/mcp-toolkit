/**
 * Width-aware layout for the statements the generator emits, so the generated
 * files come out exactly as Prettier (printWidth 100, the toolkit's style)
 * would print them, without a Prettier dependency at generation time.
 *
 * A trimmed copy of Prettier's document printer: a `group` prints flat when it
 * fits the rest of its line, else its `line`s break. The builders below mirror
 * the doc shapes Prettier produces for the few constructs the templates leave
 * to code (imports, function signatures, calls, arrow properties, type
 * aliases). Tool names have any length, so these lines cannot be laid out in
 * a template. `codegen.property.test.ts` holds the result to real Prettier.
 */

export type Doc = string | readonly Doc[] | Group | Indent | IndentIfBreak | Line | IfBreak

interface Group {
  readonly kind: "group"
  readonly contents: Doc
  readonly id?: symbol
}

interface Indent {
  readonly kind: "indent"
  readonly contents: Doc
}

interface IndentIfBreak {
  readonly kind: "indent-if-break"
  readonly contents: Doc
  readonly groupId: symbol
}

interface Line {
  readonly kind: "line"
  readonly soft: boolean
}

interface IfBreak {
  readonly kind: "if-break"
  readonly breakContents: Doc
  readonly flatContents: Doc
}

type Mode = "flat" | "break"

interface Command {
  readonly indent: number
  readonly mode: Mode
  readonly doc: Doc
}

export const PRINT_WIDTH = 100
const INDENT = "  "

/** A space when its group prints flat, a newline when it breaks. */
export const line: Doc = { kind: "line", soft: false }
/** Nothing when its group prints flat, a newline when it breaks. */
export const softline: Doc = { kind: "line", soft: true }

export function group(contents: Doc, id?: symbol): Doc {
  return { kind: "group", contents, id }
}

export function indent(contents: Doc): Doc {
  return { kind: "indent", contents }
}

function indentIfBreak(contents: Doc, groupId: symbol): Doc {
  return { kind: "indent-if-break", contents, groupId }
}

function ifBreak(breakContents: Doc, flatContents: Doc = ""): Doc {
  return { kind: "if-break", breakContents, flatContents }
}

export function join(separator: Doc, docs: readonly Doc[]): Doc[] {
  return docs.flatMap((doc, index) => (index === 0 ? [doc] : [separator, doc]))
}

/**
 * Prints `doc` starting at `indentLevel` (two spaces per level, applied to the
 * first line as well), breaking groups that do not fit `PRINT_WIDTH`.
 */
export function printDoc(doc: Doc, indentLevel = 0): string {
  const printer: Printer = {
    out: [INDENT.repeat(indentLevel)],
    position: indentLevel * INDENT.length,
    groupModes: new Map(),
  }
  const commands: Command[] = [{ indent: indentLevel, mode: "break", doc }]
  for (let command = commands.pop(); command; command = commands.pop()) {
    const { indent: level, mode, doc: current } = command
    if (typeof current === "string") {
      write(printer, current)
    } else if (!isDocArray(current) && current.kind === "line") {
      if (mode === "break") {
        printer.out.push("\n" + INDENT.repeat(level))
        printer.position = level * INDENT.length
      } else if (!current.soft) {
        write(printer, " ")
      }
    } else {
      commands.push(...expand(command, current, commands, printer).reverse())
    }
  }
  return printer.out.join("")
}

interface Printer {
  readonly out: string[]
  position: number
  readonly groupModes: Map<symbol | undefined, Mode>
}

function write(printer: Printer, text: string): void {
  printer.out.push(text)
  printer.position += text.length
}

/** The commands a container prints, in order; a group picks its mode here. */
function expand(
  command: Command,
  doc: Exclude<Doc, string | Line>,
  rest: readonly Command[],
  printer: Printer,
): Command[] {
  const { indent: level, mode } = command
  if (isDocArray(doc)) return doc.map((child) => ({ indent: level, mode, doc: child }))
  if (doc.kind === "indent") return [{ indent: level + 1, mode, doc: doc.contents }]
  if (doc.kind === "indent-if-break") {
    const extra = printer.groupModes.get(doc.groupId) === "break" ? 1 : 0
    return [{ indent: level + extra, mode, doc: doc.contents }]
  }
  if (doc.kind === "if-break") {
    return [{ indent: level, mode, doc: mode === "break" ? doc.breakContents : doc.flatContents }]
  }
  const flat: Command = { indent: level, mode: "flat", doc: doc.contents }
  const next = fits(flat, rest, PRINT_WIDTH - printer.position)
    ? flat
    : { ...flat, mode: "break" as const }
  printer.groupModes.set(doc.id, next.mode)
  return [next]
}

/**
 * Whether `next` printed flat, followed by the rest of the document up to its
 * next possible line break, fits into `width` columns (Prettier's `fits`).
 */
function fits(next: Command, rest: readonly Command[], width: number): boolean {
  let remaining = width
  let restIndex = rest.length
  const commands: Command[] = [next]
  while (remaining >= 0) {
    const command = commands.pop() ?? rest[--restIndex]
    if (!command) return true
    const { mode, doc } = command
    if (typeof doc === "string") {
      remaining -= doc.length
    } else if (isDocArray(doc)) {
      for (let i = doc.length - 1; i >= 0; i--) commands.push({ ...command, doc: doc[i] as Doc })
    } else if (doc.kind === "line") {
      if (mode === "break") return true
      if (!doc.soft) remaining -= 1
    } else if (doc.kind === "if-break") {
      commands.push({ ...command, doc: mode === "break" ? doc.breakContents : doc.flatContents })
    } else {
      // group, indent, indent-if-break: indentation never changes a line's width.
      commands.push({ ...command, doc: doc.contents })
    }
  }
  return false
}

function isDocArray(doc: Doc): doc is readonly Doc[] {
  return Array.isArray(doc)
}

// ── Prettier's doc shapes for the generated statements ──────────────────────

/** `open item, item close`, one item per line with a trailing comma when broken. */
function delimited(
  open: string,
  items: readonly Doc[],
  close: string,
  trailingComma: boolean,
): Doc {
  return [
    open,
    indent([softline, join([",", line], items)]),
    trailingComma ? ifBreak(",") : "",
    softline,
    close,
  ]
}

const SIMPLE_TYPE = /^[A-Za-z_$][\w$]*$/

/**
 * Type arguments `<A, B>`. Prettier never breaks a lone simple type argument
 * (`Map<Key>`), and never prints a trailing comma in an instantiation.
 */
export function typeArguments(args: readonly string[]): Doc {
  if (args.length === 1 && SIMPLE_TYPE.test(String(args[0]))) return `<${String(args[0])}>`
  return group(delimited("<", args, ">", false))
}

/** `left = right`, breaking inside `right` first, then after `=` (Prettier's "fluid" layout). */
export function assignment(left: Doc, right: Doc): Doc {
  const id = Symbol("assignment")
  return group([left, " =", group(indent(line), id), indentIfBreak(right, id)])
}

/** `left = right`, breaking after `=` first (Prettier's "break-after-operator" layout). */
export function breakAfterOperator(left: Doc, right: Doc): Doc {
  return group([left, " =", group(indent([line, right]))])
}

/** `import { a, b } from "x"`; a single specifier never breaks. */
export function namedImport(specifiers: readonly string[], from: string, typeOnly = false): Doc {
  const keyword = typeOnly ? "import type " : "import "
  const source = ` from ${JSON.stringify(from)}`
  if (specifiers.length === 1) return [keyword, "{ ", specifiers, " }", source]
  return [
    keyword,
    group(["{", indent([line, join([",", line], specifiers)]), ifBreak(","), line, "}"]),
    source,
  ]
}

/** `head<T>(a, b): R {`: type parameters, parameters and return type break as one group. */
export function functionSignature(
  head: string,
  typeParameters: readonly Doc[],
  parameters: readonly Doc[],
  returnType: Doc = "",
): Doc {
  const typeParameterList =
    typeParameters.length > 0 ? group(delimited("<", typeParameters, ">", true)) : ""
  const returns = returnType === "" ? "" : [": ", returnType]
  return [head, group([typeParameterList, delimited("(", parameters, ")", true), returns]), " {"]
}

/** `callee<T>(a, b)` */
export function call(callee: string, typeArgs: Doc, args: readonly Doc[]): Doc {
  return [callee, typeArgs, group(delimited("(", args, ")", true))]
}

/** An object property whose value is an arrow function with an expression body. */
export function arrowProperty(key: string, parameters: readonly Doc[], body: Doc): Doc {
  return [
    key,
    ": ",
    group([group(delimited("(", parameters, ")", true)), " =>", group(indent([line, body]))]),
    ",",
  ]
}
