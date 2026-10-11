import { FOCUS_RING } from "../lib/focus-ring.js"
import { useToolkitMessages } from "../locale/locale-provider.js"
import { Input } from "../primitives/input.js"

export interface FilterChip {
  /** Stable id passed back to `onChipToggle`. */
  id: string
  /** Visible chip label. */
  label: string
  /** Optional count rendered after the label. */
  count?: number | string
  /** Whether the chip is currently active. */
  active?: boolean
}

export interface FilterBarProps {
  /** Current search text (controlled). */
  search: string
  /** Placeholder for the search input. Default: the locale's "Filter…". */
  searchPlaceholder?: string
  /** Called with the new search text on every keystroke. */
  onSearchChange: (next: string) => void
  /** Filter chips rendered to the right of the search input. */
  chips: FilterChip[]
  /** Called with a chip id when it is toggled. */
  onChipToggle: (id: string) => void
}

/**
 * Search input + toggleable chip row for filtering a list/table of widget
 * items. Pair with `useDebouncedValue` to avoid re-querying on every keystroke.
 */
export function FilterBar({
  search,
  searchPlaceholder,
  onSearchChange,
  chips,
  onChipToggle,
}: FilterBarProps) {
  const messages = useToolkitMessages()
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Input
        type="search"
        value={search}
        onChange={(e) => onSearchChange(e.target.value)}
        placeholder={searchPlaceholder ?? messages.filterBar.searchPlaceholder}
        className="h-9 min-w-[220px] flex-1 text-sm"
      />
      <div className="flex flex-wrap gap-1.5">
        {chips.map((chip) => (
          <button
            type="button"
            key={chip.id}
            onClick={() => onChipToggle(chip.id)}
            className={`inline-flex items-center gap-1.5 rounded-sm border px-2.5 py-1 text-xs font-medium transition-colors ${FOCUS_RING} ${
              chip.active
                ? "bg-accent border-focus text-accent-foreground font-semibold"
                : "border-border bg-background text-muted-foreground hover:bg-muted hover:text-foreground"
            }`}
          >
            {chip.label}
            {chip.count !== undefined && chip.count !== "" && (
              <span className="font-normal tabular-nums">{chip.count}</span>
            )}
          </button>
        ))}
      </div>
    </div>
  )
}
