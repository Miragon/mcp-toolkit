import fc from "fast-check"
import { describe, expect, it } from "vitest"
import { camelCase, jsString, NameRegistry, pascalCase, propertyKey } from "./identifiers.js"

fc.configureGlobal({ seed: 42, numRuns: 200 })

describe("pascalCase", () => {
  it.each([
    ["get_task", "GetTask"],
    ["get-task", "GetTask"],
    ["getTask", "GetTask"],
    ["tasks.list", "TasksList"],
    ["tasks/list items", "TasksListItems"],
    ["GET_TASK", "GETTASK"],
    ["v2", "V2"],
    ["9lives", "9Lives"],
    ["route53_zone", "Route53Zone"],
    ["a1b2c", "A1B2C"],
    ["tâche", "TChe"],
    [`x"]; evil()`, "XEvil"],
    ["", ""],
    ["-_- ***", ""],
    ["工具", ""],
  ])("%j → %j", (name, expected) => {
    expect(pascalCase(name)).toBe(expected)
  })

  // Bug class guarded: #177, any tool name reaching an identifier position with
  // something else than letters and digits.
  it("yields only ASCII letters and digits, never a lower-case first letter, for any string", () => {
    fc.assert(
      fc.property(fc.string({ unit: "binary" }), (name) => {
        expect(pascalCase(name)).toMatch(/^(?:[A-Z0-9][A-Za-z0-9]*)?$/)
      }),
    )
  })

  // json-schema-to-typescript upper-cases a letter after a digit in the names
  // it declares; both must spell `<Prefix><Pascal>Input` alike.
  it("never leaves a lower-case letter after a digit", () => {
    fc.assert(
      fc.property(fc.string(), (name) => {
        expect(pascalCase(name)).not.toMatch(/\d[a-z]/)
      }),
    )
  })
})

describe("camelCase", () => {
  it.each([
    ["get_task", "getTask"],
    ["GetTask", "getTask"],
    ["9lives", "_9Lives"],
    ["v2", "v2"],
    ["42", "_42"],
    ["", ""],
  ])("%j → %j", (name, expected) => {
    expect(camelCase(name)).toBe(expected)
  })

  it("is a valid identifier for every name with an identifier character", () => {
    fc.assert(
      fc.property(fc.string({ unit: "binary" }), (name) => {
        fc.pre(pascalCase(name) !== "")
        expect(camelCase(name)).toMatch(/^[a-z_][A-Za-z0-9]*$/)
      }),
    )
  })
})

describe("jsString", () => {
  it("round-trips any string through a JSON string literal", () => {
    fc.assert(
      fc.property(fc.string({ unit: "binary" }), (value) => {
        expect(JSON.parse(jsString(value))).toBe(value)
      }),
    )
  })

  it("writes invisible characters as escapes and keeps other text readable", () => {
    const rlo = String.fromCharCode(0x202e)
    expect(jsString(`a${rlo}b`)).toBe('"a\\u202eb"')
    expect(jsString(`id${String.fromCharCode(0x3164)}`)).toBe('"id\\u3164"')
    expect(jsString("é ü 工")).toBe('"é ü 工"')
    expect(jsString('say "hi"\n')).toBe('"say \\"hi\\"\\n"')
  })
})

describe("propertyKey", () => {
  it.each([
    ["list_tasks", "list_tasks"],
    ["$ref", "$ref"],
    ["get-task", '"get-task"'],
    ["1st", '"1st"'],
    ["tâche", '"tâche"'],
    ["", '""'],
    [`a"]: x`, '"a\\"]: x"'],
  ])("%j → %s", (name, expected) => {
    expect(propertyKey(name)).toBe(expected)
  })
})

describe("NameRegistry", () => {
  it("accepts distinct names and rejects a second claim, naming both owners", () => {
    const registry = new NameRegistry("tools.ts")
    registry.claim("A", "the tool a", true)
    registry.claim("B", "the tool b", true)
    expect(() => registry.claim("A", "the tool A", true)).toThrow(
      'cannot generate tools.ts: the tool a and the tool A both produce the identifier "A". ' +
        "Rename one of the tools on the server, or give one another identifier with overrides.<tool>.identifier.",
    )
  })

  // A config name cannot fix a collision between two tools or with a built-in, nor renaming a
  // tool one between the config name and an import.
  it.each<[boolean, boolean, string]>([
    [false, true, "Rename the tool on the server, or give it another identifier"],
    [true, false, "Rename the tool on the server, or give it another identifier"],
    [false, false, "Change the config name."],
  ])("from a tool: %s and %s, says what can resolve the collision", (first, second, remedy) => {
    const registry = new NameRegistry("tools.ts")
    registry.claim("X", "the first", first)
    expect(() => registry.claim("X", "the second", second)).toThrow(
      `cannot generate tools.ts: the first and the second both produce the identifier "X". ${remedy}`,
    )
  })
})
