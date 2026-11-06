/**
 * Whether a diff reaches the mutation gate ("Mutation diff gate" in ci.yml): the packages the
 * root test:mutation script mutates, what their tests read, the toolchain and the gate itself. A
 * pull request that changes none of it (the docs, the example, a README, another workflow) skips
 * the gate, which the required check counts as passed.
 *
 *   node scripts/mutation-scope.mjs <base> <head>   # prints mutation=true or mutation=false
 */
import { execFileSync } from "node:child_process"
import { realpathSync } from "node:fs"
import { fileURLToPath } from "node:url"

export const MUTATION_SCOPE = [
  // The mutated packages with their tests, templates and configs (Stryker, Vitest, TypeScript,
  // package.json), and react, whose built .d.ts the generator's tests type-check generated hooks
  // against. Their README and LICENSE reach no test.
  /^packages\/tool-codegen(?:-core|-react)?\/(?!(?:README\.md|LICENSE)$)/,
  // test:mutation, the resolved tool versions and the shared compiler options.
  /^(?:package\.json|pnpm-lock\.yaml|pnpm-workspace\.yaml|\.npmrc|tsconfig\.base\.json)$/,
  // The gate.
  /^\.github\/workflows\/ci\.yml$/,
  /^scripts\/mutation-scope\.mjs$/,
]

/** True when any of the repository-relative `files` is in the mutation gate's scope. */
export const inMutationScope = (files) =>
  files.some((file) => MUTATION_SCOPE.some((pattern) => pattern.test(file)))

// Run as a script, not imported by the test.
if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [base, head] = process.argv.slice(2)
  if (!base || !head) throw new Error("usage: node scripts/mutation-scope.mjs <base> <head>")
  // --no-renames lists a moved file under its old path too, so a file moved out of a package
  // counts. A failing git throws: no output, and the gate runs.
  const files = execFileSync("git", ["diff", "--name-only", "--no-renames", base, head], {
    encoding: "utf8",
  })
    .split("\n")
    .filter(Boolean)
  console.log(`mutation=${inMutationScope(files)}`)
}
