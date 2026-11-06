import { fileURLToPath } from "node:url"
import fc from "fast-check"
import * as prettier from "prettier"
import ts from "typescript"
import { describe, expect, it } from "vitest"
import { renderCodegen } from "./codegen.js"
import type { CodegenConfig } from "./config.js"
import type { ToolDescriptor } from "./fetch-tools.js"
import { pascalCase } from "./identifiers.js"
import { syntaxErrors, topLevelDeclarations } from "./test-support/typescript.js"

// Deterministic PRNG: a property failure in CI replays identically on the next run.
fc.configureGlobal({ seed: 42, numRuns: 40 })

const config: CodegenConfig = {
  name: "app",
  url: "https://example.com/mcp",
  out: "out",
  react: true,
}

const byName = (a: ToolDescriptor, b: ToolDescriptor) =>
  a.name < b.name ? -1 : a.name > b.name ? 1 : 0

/** Deterministic Fisher–Yates driven by a fast-check-supplied seed. */
function shuffle<T>(items: readonly T[], seed: number): T[] {
  const out = [...items]
  let state = seed + 1
  for (let i = out.length - 1; i > 0; i--) {
    state = (state * 48271) % 2147483647
    const j = state % (i + 1)
    ;[out[i], out[j]] = [out[j] as T, out[i] as T]
  }
  return out
}

const plainName = fc.stringMatching(/^[a-z][a-z0-9]{0,6}([-_][a-z0-9]{1,6}){0,2}$/)

/**
 * Tools whose names map to distinct identifiers; a collision, a name without
 * identifier characters and a tool named like the client's `call` are their
 * own, tested, errors.
 */
function toolList(
  name: fc.Arbitrary<string>,
  tool: (name: string) => fc.Arbitrary<ToolDescriptor>,
) {
  return fc
    .uniqueArray(name, { minLength: 1, maxLength: 3, selector: pascalCase })
    .filter((names) => names.every((entry) => !["", "Call"].includes(pascalCase(entry))))
    .chain((names) => fc.tuple(...names.map(tool)))
}

describe("renderCodegen (property)", () => {
  // Bug class guarded: `generate --check` byte-compares the committed files;
  // a tools/list order leaking into the output would flap it on every run.
  it("renders byte-identical output for every order of the same tools", async () => {
    const tools = toolList(plainName, (name) =>
      fc.record({
        name: fc.constant(name),
        inputSchema: fc.constant({ type: "object", properties: { id: { type: "string" } } }),
        annotations: fc.record({ readOnlyHint: fc.boolean() }),
      }),
    )
    await fc.assert(
      fc.asyncProperty(tools, fc.nat(1000), async (list, seed) => {
        const original = await renderCodegen(list, config)
        const shuffled = await renderCodegen(shuffle(list, seed), config)
        expect(shuffled).toEqual(original)
      }),
      { numRuns: 20 },
    )
  })

  // Bug class guarded: #177, a hostile tools/list injecting code into the
  // generated files through a name, a description or a property key.
  it("emits code that parses and declares exactly its own names, whatever the server sends", async () => {
    const hostileText = fc
      .array(
        fc.oneof(
          fc.constantFrom(
            '"',
            "'",
            "`",
            "*/",
            "/*",
            "\n",
            "\r\n",
            "\\",
            "${",
            "]",
            "}",
            "<",
            "__proto__",
          ),
          fc.constantFrom(String.fromCharCode(0x2028), String.fromCharCode(0x202e), "ü", "工"),
          fc.string({ unit: "binary", maxLength: 3 }),
          fc.stringMatching(/^[A-Za-z0-9]{1,4}$/),
        ),
        { maxLength: 6 },
      )
      .map((parts) => parts.join(""))
    const tools = toolList(hostileText, (name) =>
      fc.record({
        name: fc.constant(name),
        description: hostileText,
        inputSchema: fc.uniqueArray(hostileText, { maxLength: 3 }).chain((keys) =>
          fc.tuple(...keys.map(() => hostileText)).map((descriptions) => ({
            type: "object",
            properties: Object.fromEntries(
              keys.map((key, i) => [key, { type: "string", description: descriptions[i] }]),
            ),
          })),
        ),
        annotations: fc.record({ readOnlyHint: fc.boolean() }),
      }),
    )
    await fc.assert(
      fc.asyncProperty(tools, async (list) => {
        const { toolsFile, hooksFile = "" } = await renderCodegen(list, config)
        const sorted = [...list].sort(byName)
        expect(syntaxErrors(toolsFile, "tools.ts")).toEqual([])
        expect(syntaxErrors(hooksFile, "hooks.tsx")).toEqual([])
        expect(topLevelDeclarations(toolsFile, "tools.ts")).toEqual([
          ...sorted.flatMap(({ name }) => [
            `App${pascalCase(name)}Input`,
            `App${pascalCase(name)}Output`,
          ]),
          "AppToolMap",
          "AppToolName",
          "AppCallTool",
          "createAppClient",
          "AppClient",
        ])
        const queries = sorted.filter((tool) => tool.annotations?.readOnlyHint === true)
        expect(topLevelDeclarations(hooksFile, "hooks.tsx")).toHaveLength(
          sorted.length + (queries.length > 0 ? 1 : 0),
        )
        expect(toolMapKeys(toolsFile)).toEqual(sorted.map(({ name }) => name))
      }),
    )
  })

  // Bug class guarded: committed generated code failing the consumer's
  // Prettier gate, for any length of tool name (the layout is width-aware).
  it("emits Prettier-clean files for well-formed tools of any name length", async () => {
    const options = {
      ...(await prettier.resolveConfig(fileURLToPath(import.meta.url))),
      parser: "typescript",
    }
    const longName = fc.stringMatching(/^[a-z][a-z0-9]{0,40}([-_][a-z0-9]{1,30}){0,3}$/)
    const tools = toolList(longName, (name) =>
      fc.record({
        name: fc.constant(name),
        description: fc.option(fc.lorem({ maxCount: 12 }), { nil: undefined }),
        inputSchema: fc.boolean().map((required) => ({
          type: "object",
          properties: { query: { type: "string" }, limit: { type: "number" } },
          ...(required ? { required: ["query"] } : {}),
        })),
        outputSchema: fc.option(
          fc.constant({ type: "object", properties: { ok: { type: "boolean" } } }),
          {
            nil: undefined,
          },
        ),
        annotations: fc.record({ readOnlyHint: fc.boolean() }),
      }),
    )
    const clientName = fc.stringMatching(/^[a-z][a-z0-9]{0,30}(-[a-z0-9]{1,12})?$/)
    await fc.assert(
      fc.asyncProperty(tools, clientName, async (list, name) => {
        const { toolsFile, hooksFile = "" } = await renderCodegen(list, { ...config, name })
        expect(await prettier.format(toolsFile, options)).toBe(toolsFile)
        expect(await prettier.format(hooksFile, options)).toBe(hooksFile)
      }),
      { numRuns: 60 },
    )
  })
})

/** The keys of the generated tool map, as TypeScript reads them. */
function toolMapKeys(toolsFile: string): string[] {
  const source = ts.createSourceFile("tools.ts", toolsFile, ts.ScriptTarget.ES2022, true)
  const map = source.statements.find(
    (statement): statement is ts.InterfaceDeclaration =>
      ts.isInterfaceDeclaration(statement) && statement.name.text === "AppToolMap",
  )
  return (map?.members ?? []).map((member) =>
    member.name && (ts.isStringLiteral(member.name) || ts.isIdentifier(member.name))
      ? member.name.text
      : "<computed>",
  )
}
