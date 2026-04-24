/**
 * Resolves the active-modules list from a `MIRANUM_ACTIVE_MODULES`-style
 * env value. Empty / unset / `"all"` → every known module. A comma-separated
 * list narrows to the matching subset; unknown entries log a warning and are
 * dropped so a typo doesn't fail boot for every other module.
 */
export function resolveActiveModules(envValue: string | undefined, known: string[]): string[] {
  const trimmed = envValue?.trim()
  if (!trimmed || trimmed === "all") return known

  const requested = trimmed
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)

  const knownSet = new Set(known)
  const result: string[] = []
  for (const name of requested) {
    if (!knownSet.has(name)) {
      console.warn(`[mcp-toolkit] unknown module "${name}" in active-modules list — skipping`)
      continue
    }
    result.push(name)
  }
  return result
}
