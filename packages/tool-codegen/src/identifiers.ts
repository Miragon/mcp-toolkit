/**
 * Identifiers and property keys for the generated code.
 *
 * Tool names come from the server's tools/list and are untrusted
 * (Miragon/mcp-toolkit#177: names copied verbatim into generated code let a
 * malicious MCP server inject code). An identifier is therefore built only from
 * the [A-Za-z0-9] runs of a name; anywhere else a name appears as a string
 * literal (`jsString`) or a quoted property key (`propertyKey`).
 */
import { escapeInvisible } from "./safe-text.js"

const WORD = /[A-Za-z0-9]+/g

/**
 * PascalCase from the [A-Za-z0-9] runs of `name`, each run capitalised; ""
 * when there is none. A letter after a digit is upper-cased, as
 * json-schema-to-typescript does for every type name it declares, so both
 * spell a generated type name alike.
 */
export function pascalCase(name: string): string {
  const words = name.match(WORD) ?? []
  return words
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join("")
    .replace(/(\d)([a-z])/g, (_, digit: string, letter: string) => digit + letter.toUpperCase())
}

/** camelCase twin of {@link pascalCase}; a leading digit gets a `_` prefix. */
export function camelCase(name: string): string {
  const pascal = pascalCase(name)
  const camel = pascal.charAt(0).toLowerCase() + pascal.slice(1)
  return /^\d/.test(camel) ? `_${camel}` : camel
}

/**
 * A string literal for untrusted text: JSON-escaped, with every invisible
 * character (controls, bidirectional overrides, zero-width characters) as a
 * `\u` escape, so none reaches the generated file raw ("Trojan Source",
 * CVE-2021-42574).
 */
export function jsString(value: string): string {
  return escapeInvisible(JSON.stringify(value))
}

const PLAIN_KEY = /^[A-Za-z_$][A-Za-z0-9_$]*$/

/** An interface property key: bare when it is a plain identifier (as Prettier prints it), else a string literal. */
export function propertyKey(name: string): string {
  return PLAIN_KEY.test(name) ? name : jsString(name)
}

interface Owner {
  readonly label: string
  /**
   * A server's tool, rather than the config's `name` or what the file cannot
   * rename (an import, the client's `call`, a JavaScript built-in).
   */
  readonly fromTool: boolean
}

/** How to resolve a collision: rename a tool that produces the name, else the config name. */
function remedy(first: boolean, second: boolean): string {
  if (!first && !second) return "Change the config name."
  if (first && second) {
    return "Rename one of the tools on the server, or give one another identifier with overrides.<tool>.identifier."
  }
  return "Rename the tool on the server, or give it another identifier with overrides.<tool>.identifier."
}

/**
 * The declared names of one generated file. Every name is claimed with the
 * thing that produces it; a second claim fails generation and names both, so
 * two tools can never silently share (or shadow) a declaration.
 */
export class NameRegistry {
  readonly #owners = new Map<string, Owner>()

  constructor(private readonly file: string) {}

  claim(name: string, label: string, fromTool: boolean): void {
    const previous = this.#owners.get(name)
    if (previous !== undefined) {
      throw new Error(
        `cannot generate ${this.file}: ${previous.label} and ${label} both produce the identifier "${name}". ` +
          remedy(previous.fromTool, fromTool),
      )
    }
    this.#owners.set(name, { label, fromTool })
  }
}
