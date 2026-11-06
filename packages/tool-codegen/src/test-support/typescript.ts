/**
 * TypeScript's own parser and checker over generated code, for tests: the
 * generator must emit code that parses, declares exactly the names it means
 * to, and type-checks against the runtime packages' public API.
 */
import path from "node:path"
import { fileURLToPath } from "node:url"
import ts from "typescript"

/** Syntax errors of `code`, as TypeScript reports them (no type checking). */
export function syntaxErrors(code: string, fileName: string): string[] {
  const { diagnostics = [] } = ts.transpileModule(code, {
    fileName,
    reportDiagnostics: true,
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
  })
  return diagnostics.map((diagnostic) =>
    ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n"),
  )
}

/**
 * The names `code` declares at the top level, in order. Any other statement
 * but an import shows up as `<SyntaxKind>`, so injected code is visible.
 */
export function topLevelDeclarations(code: string, fileName: string): string[] {
  const source = ts.createSourceFile(fileName, code, ts.ScriptTarget.ES2022, true)
  return source.statements.flatMap((statement) => {
    if (ts.isImportDeclaration(statement)) return []
    if (
      (ts.isInterfaceDeclaration(statement) ||
        ts.isTypeAliasDeclaration(statement) ||
        ts.isFunctionDeclaration(statement) ||
        ts.isEnumDeclaration(statement) ||
        ts.isClassDeclaration(statement)) &&
      statement.name
    ) {
      return [statement.name.text]
    }
    if (
      ts.isExportDeclaration(statement) &&
      !statement.exportClause &&
      !statement.moduleSpecifier
    ) {
      return [] // `export {}`
    }
    return [`<${ts.SyntaxKind[statement.kind]}>`]
  })
}

const COMPILER_OPTIONS: ts.CompilerOptions = {
  target: ts.ScriptTarget.ES2022,
  module: ts.ModuleKind.ESNext,
  moduleResolution: ts.ModuleResolutionKind.Bundler,
  jsx: ts.JsxEmit.Preserve,
  strict: true,
  noUncheckedIndexedAccess: true,
  noUnusedLocals: true,
  noUnusedParameters: true,
  isolatedModules: true,
  // As a library compiling the generated files would: every exported type must be nameable.
  declaration: true,
  noEmit: true,
  lib: ["lib.es2022.d.ts", "lib.dom.d.ts"],
  types: [],
  // The runtime packages and their dependencies are checked by their own builds.
  skipLibCheck: true,
}

const libFiles = new Map<string, ts.SourceFile | undefined>()

/**
 * Where the in-memory files live: a directory of this package that does not
 * exist on disk, so `@miragon/mcp-toolkit-tool-codegen-core` and `-react`
 * resolve through this package's node_modules to their built declarations,
 * as they do for an app (run `pnpm build` first).
 */
const GEN_DIR = fileURLToPath(new URL("../../.typecheck-gen", import.meta.url)).replaceAll(
  "\\",
  "/",
)

/**
 * Type errors of in-memory files (name → code; `.ts`/`.tsx`), checked against
 * the runtime packages' built API. Unused locals count.
 *
 * A test that calls it sets a 30 s timeout: a full program over the DOM lib
 * and the runtime packages' declarations takes 3 to 5 s on a CI runner under
 * coverage, which vitest's 5 s default cut off.
 */
export function typeErrors(files: Record<string, string>): string[] {
  const virtual = new Map(Object.entries(files).map(([name, code]) => [`${GEN_DIR}/${name}`, code]))
  const host = ts.createCompilerHost(COMPILER_OPTIONS)
  const readLib = host.getSourceFile.bind(host)
  host.getSourceFile = (fileName, languageVersion) => {
    const code = virtual.get(fileName)
    if (code !== undefined) return ts.createSourceFile(fileName, code, languageVersion, true)
    if (!libFiles.has(fileName)) libFiles.set(fileName, readLib(fileName, languageVersion))
    return libFiles.get(fileName)
  }
  host.fileExists = (fileName) => virtual.has(fileName) || ts.sys.fileExists(fileName)
  host.directoryExists = (dir) => dir === GEN_DIR || ts.sys.directoryExists(dir)
  host.readFile = (fileName) => virtual.get(fileName) ?? ts.sys.readFile(fileName)
  const program = ts.createProgram([...virtual.keys()], COMPILER_OPTIONS, host)
  return ts
    .getPreEmitDiagnostics(program)
    .map(
      (diagnostic) =>
        `${path.basename(diagnostic.file?.fileName ?? "")}: ${ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n")}`,
    )
}
