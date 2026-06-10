/**
 * A parsed active-modules entry: the module `name` plus an optional
 * `qualifier` that selects a named instance/variant of that module (the part
 * after the first colon in a `"name:qualifier"` token, e.g. `"camunda7:prod"`).
 */
export interface ActiveModuleSelection {
  name: string
  qualifier?: string
}

/**
 * Parses a `MIRANUM_ACTIVE_MODULES`-style env value into structured
 * selections. Empty / unset / `"all"` → every known module (no qualifier). A
 * comma-separated list narrows to the matching subset; each token may carry a
 * `:qualifier` suffix to pick a named instance of that module. Unknown module
 * names log a warning and are dropped so a typo doesn't fail boot for every
 * other module.
 *
 * The colon is split on first occurrence only, so qualifiers may themselves
 * contain colons (e.g. a URL-shaped qualifier). Empty segments produced by
 * stray commas are ignored without warning.
 */
export function parseActiveModules(
  envValue: string | undefined,
  known: string[],
): ActiveModuleSelection[] {
  const trimmed = envValue?.trim()
  if (!trimmed || trimmed === "all") return known.map((name) => ({ name }))

  const tokens = trimmed
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)

  const knownSet = new Set(known)
  const result: ActiveModuleSelection[] = []
  for (const token of tokens) {
    const colon = token.indexOf(":")
    const name = colon === -1 ? token : token.slice(0, colon)
    const qualifier = colon === -1 ? undefined : token.slice(colon + 1).trim() || undefined

    if (!knownSet.has(name)) {
      console.warn(`[mcp-toolkit] unknown module "${name}" in active-modules list — skipping`)
      continue
    }
    result.push(qualifier === undefined ? { name } : { name, qualifier })
  }
  return result
}

/**
 * Resolves the active-modules list to the matching module *names*, dropping
 * any `:qualifier` suffixes. Thin wrapper over {@link parseActiveModules} for
 * callers that only need the set of enabled modules (the common case). Empty /
 * unset / `"all"` → every known module; unknown entries warn and are skipped.
 */
export function resolveActiveModules(envValue: string | undefined, known: string[]): string[] {
  return parseActiveModules(envValue, known).map((selection) => selection.name)
}
