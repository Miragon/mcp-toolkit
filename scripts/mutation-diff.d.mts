/** Type surface for the pure half of mutation-diff.mjs (unit-tested from examples/test). */
export function intersectAllowlist(
  changedFiles: string[],
  pkgDir: string,
  mutateGlobs: string[],
): string[]
