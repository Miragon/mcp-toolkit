import { describe, expect, it } from "vitest"
import {
  arrowProperty,
  assignment,
  breakAfterOperator,
  call,
  functionSignature,
  group,
  indent,
  line,
  namedImport,
  printDoc,
  softline,
  typeArguments,
} from "./layout.js"

/** A string of `width` characters. */
const w = (width: number, char = "x") => char.repeat(width)

describe("printDoc", () => {
  it("prints a group flat when it fits exactly 100 columns, broken at 101", () => {
    const doc = (width: number) => group([w(width - 2), indent([line, "y"])])
    expect(printDoc(doc(100))).toBe(`${w(98)} y`)
    expect(printDoc(doc(101))).toBe(`${w(99)}\n  y`)
  })

  it("counts the text after a group up to the next possible break", () => {
    const doc = (tail: number) => [
      group(["a", indent([softline, "b"])]),
      w(tail),
      group([line, "c"]),
    ]
    expect(printDoc(doc(98))).toBe(`ab${w(98)}\nc`)
    expect(printDoc(doc(99))).toBe(`a\n  b${w(99)}\nc`)
  })

  it("indents every line by the starting level, the first included", () => {
    expect(printDoc(group([w(95), indent([line, "y"])]), 2)).toBe(`    ${w(95)}\n      y`)
    expect(printDoc(group([w(94), indent([line, "y"])]), 2)).toBe(`    ${w(94)} y`)
  })

  it("prints groups inside a flat group flat", () => {
    expect(printDoc(group(["a", group([line, "b"]), softline, "c"]))).toBe("a bc")
  })
})

describe("typeArguments", () => {
  it("never breaks a lone simple type argument", () => {
    expect(printDoc(["T", typeArguments([w(120)])])).toBe(`T<${w(120)}>`)
  })

  it("breaks other lists one per line, without a trailing comma", () => {
    expect(printDoc(["T", typeArguments(["A", "B"])])).toBe("T<A, B>")
    expect(printDoc(["T", typeArguments([w(60), w(60)])])).toBe(`T<\n  ${w(60)},\n  ${w(60)}\n>`)
    expect(printDoc(["T", typeArguments([`typeof ${w(100)}`])])).toBe(`T<\n  typeof ${w(100)}\n>`)
  })
})

describe("assignment", () => {
  it("breaks after = when the right side cannot break", () => {
    expect(printDoc(assignment("export type A", "keyof B"))).toBe("export type A = keyof B")
    expect(printDoc(assignment(`export type ${w(50)}`, `keyof ${w(50)}`))).toBe(
      `export type ${w(50)} =\n  keyof ${w(50)}`,
    )
  })

  it("breaks inside the right side first when it can", () => {
    expect(
      printDoc(assignment(`export type ${w(50)}`, ["R", typeArguments([`typeof ${w(50)}`])])),
    ).toBe(`export type ${w(50)} = R<\n  typeof ${w(50)}\n>`)
  })

  it("breaks after = when not even the right side's first line fits, and indents it", () => {
    expect(printDoc(assignment(`export type ${w(80)}`, ["R", typeArguments([w(30), w(30)])]))).toBe(
      `export type ${w(80)} = R<\n  ${w(30)},\n  ${w(30)}\n>`,
    )
    const record = (key: string) => ["Record", typeArguments([key, "never"])]
    expect(printDoc(assignment(`export type ${w(90)}`, record("string")))).toBe(
      `export type ${w(90)} =\n  Record<string, never>`,
    )
    expect(printDoc(assignment(`export type ${w(95)}`, record(w(95))))).toBe(
      `export type ${w(95)} =\n  Record<\n    ${w(95)},\n    never\n  >`,
    )
  })
})

describe("breakAfterOperator", () => {
  it("breaks after = first, then inside the right side", () => {
    const right = (width: number) => call(`f<${w(width)}>`, "", ["arg"])
    expect(printDoc(breakAfterOperator("const c", right(80)), 1)).toBe(
      `  const c = f<${w(80)}>(arg)`,
    )
    expect(printDoc(breakAfterOperator("const c", right(85)), 1)).toBe(
      `  const c =\n    f<${w(85)}>(arg)`,
    )
    expect(printDoc(breakAfterOperator("const c", right(92)), 1)).toBe(
      `  const c =\n    f<${w(92)}>(\n      arg,\n    )`,
    )
  })
})

describe("namedImport", () => {
  it("never breaks a single specifier", () => {
    expect(printDoc(namedImport([w(100)], "m", true))).toBe(`import type { ${w(100)} } from "m"`)
  })

  it("breaks several specifiers one per line with a trailing comma", () => {
    expect(printDoc(namedImport(["a", "type B"], "m"))).toBe(`import { a, type B } from "m"`)
    expect(printDoc(namedImport([w(50), w(50)], "m"))).toBe(
      `import {\n  ${w(50)},\n  ${w(50)},\n} from "m"`,
    )
  })
})

describe("functionSignature", () => {
  it("breaks the parameters, and the type parameters only when their line is too long", () => {
    expect(printDoc(functionSignature("function f", ["T"], ["a: A"]))).toBe("function f<T>(a: A) {")
    expect(printDoc(functionSignature("function f", ["T"], [`a: ${w(90)}`]))).toBe(
      `function f<T>(\n  a: ${w(90)},\n) {`,
    )
    expect(printDoc(functionSignature(`function ${w(90)}`, ["T = X"], ["a: A"]))).toBe(
      `function ${w(90)}<\n  T = X,\n>(\n  a: A,\n) {`,
    )
  })

  it("puts a return type after the parameters, counting it when it decides to break", () => {
    expect(printDoc(functionSignature("function f", [], ["a: A"], "R<T>"))).toBe(
      "function f(a: A): R<T> {",
    )
    // `function f(a: A): ` and ` {` take 20 columns: 100 in all still fit, 101 break.
    const signature = (width: number) =>
      printDoc(functionSignature("function f", [], ["a: A"], w(width)))
    expect(signature(80)).toBe(`function f(a: A): ${w(80)} {`)
    expect(signature(81)).toBe(`function f(\n  a: A,\n): ${w(81)} {`)
  })
})

describe("arrowProperty", () => {
  const property = (body: number, parameter = "a: A") =>
    printDoc(arrowProperty("key", [parameter], call("f", "", [`"${w(body)}"`])), 2)

  it("stays on one line when it fits", () => {
    expect(property(70)).toBe(`    key: (a: A) => f("${w(70)}"),`)
  })

  it("breaks after => when the signature fits", () => {
    expect(property(80)).toBe(`    key: (a: A) =>\n      f("${w(80)}"),`)
  })

  it("keeps the body after => when only the parameters break", () => {
    expect(property(10, `a: ${w(100)}`)).toBe(
      `    key: (\n      a: ${w(100)},\n    ) => f("${w(10)}"),`,
    )
  })

  it("breaks the body's call when it does not fit its own line either", () => {
    expect(property(95)).toBe(`    key: (a: A) =>\n      f(\n        "${w(95)}",\n      ),`)
  })
})
