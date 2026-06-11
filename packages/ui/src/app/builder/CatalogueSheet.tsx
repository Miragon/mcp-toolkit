import { useMemo } from "react"
import { ArrowDownToLine, Library, Plus } from "lucide-react"
import type { AvailableStep, KeyCatalogEntry, UnreachableWidget } from "@miragon/mcp-toolkit-core"
import { Badge } from "../../primitives/badge.js"
import { Button } from "../../primitives/button.js"
import { ScrollArea } from "../../primitives/scroll-area.js"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "../../primitives/sheet.js"
import { cn } from "../../lib/utils.js"
import type { LayoutBuilderLabels } from "./labels.js"

// -------------------------------------------------------------------------- //
// Catalogue Sheet — slides in from the right
// -------------------------------------------------------------------------- //

export function CatalogueSheet({
  L,
  open,
  onOpenChange,
  keyCatalog,
  availableSteps,
  unreachableWidgets,
  onSeedKey,
  onAddProducingStep,
}: {
  L: Required<LayoutBuilderLabels>
  open: boolean
  onOpenChange: (open: boolean) => void
  keyCatalog: KeyCatalogEntry[]
  availableSteps: AvailableStep[]
  unreachableWidgets: UnreachableWidget[]
  onSeedKey: (name: string) => void
  onAddProducingStep: (key: string) => void
}) {
  const producerOf = useMemo(() => {
    const map = new Map<string, string | undefined>()
    for (const e of keyCatalog) map.set(e.key, e.producedBySteps[0])
    return map
  }, [keyCatalog])

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-md md:max-w-lg">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2 text-base">
            <Library className="size-4" />
            {L.catalogue}
          </SheetTitle>
          <SheetDescription>{L.catalogueDescription}</SheetDescription>
        </SheetHeader>

        <ScrollArea className="flex-1 px-4 pb-4">
          <div className="flex flex-col gap-6">
            <section className="flex flex-col gap-2">
              <CatalogueSectionHeader title={L.catalogueKeys} count={keyCatalog.length} />
              {keyCatalog.length === 0 ? (
                <p className="text-muted-foreground text-xs italic">No keys registered.</p>
              ) : (
                <ul className="flex flex-col gap-1">
                  {keyCatalog.map((entry) => (
                    <li
                      key={entry.key}
                      className="hover:bg-accent/40 flex flex-col gap-1 rounded-md border px-2 py-1.5 text-xs"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <span className="truncate font-mono">{entry.key}</span>
                        <span
                          className={cn(
                            "inline-flex shrink-0 items-center gap-1 text-[10px]",
                            entry.inContext
                              ? "text-emerald-600 dark:text-emerald-400"
                              : "text-muted-foreground",
                          )}
                        >
                          <span
                            className={cn(
                              "size-1.5 rounded-full",
                              entry.inContext ? "bg-emerald-500" : "bg-muted-foreground/40",
                            )}
                          />
                          {entry.inContext ? L.catalogueLive : L.catalogueMissing}
                        </span>
                      </div>
                      {(entry.producedBySteps.length > 0 ||
                        entry.consumedBySteps.length > 0 ||
                        entry.consumedByWidgets.length > 0) && (
                        <div className="text-muted-foreground/80 flex flex-col gap-0.5 text-[10px]">
                          {entry.producedBySteps.length > 0 && (
                            <span>
                              {L.catalogueProducedBy}{" "}
                              <span className="font-mono">{entry.producedBySteps.join(", ")}</span>
                            </span>
                          )}
                          {entry.consumedBySteps.length > 0 && (
                            <span>
                              step {L.catalogueConsumedBy}{" "}
                              <span className="font-mono">{entry.consumedBySteps.join(", ")}</span>
                            </span>
                          )}
                          {entry.consumedByWidgets.length > 0 && (
                            <span>
                              widget {L.catalogueConsumedBy}{" "}
                              <span className="font-mono">
                                {entry.consumedByWidgets.join(", ")}
                              </span>
                            </span>
                          )}
                        </div>
                      )}
                      {!entry.inContext && (
                        <div className="mt-0.5 flex items-center gap-1">
                          <Button variant="ghost" size="xs" onClick={() => onSeedKey(entry.key)}>
                            <Plus /> {L.cataloguePickKey}
                          </Button>
                          {producerOf.get(entry.key) && (
                            <Button
                              variant="ghost"
                              size="xs"
                              onClick={() => onAddProducingStep(entry.key)}
                            >
                              <ArrowDownToLine /> {L.catalogueAddProducingStep}
                            </Button>
                          )}
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="flex flex-col gap-2">
              <CatalogueSectionHeader title={L.catalogueSteps} count={availableSteps.length} />
              {availableSteps.length === 0 ? (
                <p className="text-muted-foreground text-xs italic">No steps registered.</p>
              ) : (
                <ul className="flex flex-col gap-1">
                  {availableSteps.map((s) => (
                    <li
                      key={s.id}
                      className="flex flex-col gap-0.5 rounded-md border px-2 py-1.5 text-xs"
                    >
                      <span className="truncate font-mono">{s.id}</span>
                      <div className="text-muted-foreground/80 flex flex-wrap gap-x-3 text-[10px]">
                        <span className="font-mono">
                          ← {s.requires.length ? s.requires.join(", ") : "(no inputs)"}
                        </span>
                        <span className="font-mono">
                          → {s.produces.length ? s.produces.join(", ") : "(none)"}
                        </span>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="flex flex-col gap-2">
              <CatalogueSectionHeader
                title={L.catalogueUnreachable}
                count={unreachableWidgets.length}
              />
              {unreachableWidgets.length === 0 ? (
                <p className="text-muted-foreground text-xs italic">
                  {L.catalogueUnreachableEmpty}
                </p>
              ) : (
                <ul className="flex flex-col gap-1">
                  {unreachableWidgets.map((w) => {
                    const candidate = w.missingKeys
                      .map((k) => ({ key: k, step: producerOf.get(k) }))
                      .find((c) => c.step)
                    return (
                      <li
                        key={w.id}
                        className="bg-muted/20 flex flex-col gap-1 rounded-md border px-2 py-1.5 text-xs"
                      >
                        <span className="truncate font-mono">{w.id}</span>
                        <span className="text-muted-foreground/80 text-[10px]">
                          {L.catalogueNeedsKeys}{" "}
                          <span className="font-mono">{w.missingKeys.join(", ")}</span>
                        </span>
                        <div className="mt-0.5 flex flex-wrap items-center gap-1">
                          {w.missingKeys.map((k) => (
                            <Button key={k} variant="ghost" size="xs" onClick={() => onSeedKey(k)}>
                              <Plus />
                              <span className="font-mono">{k}</span>
                            </Button>
                          ))}
                          {candidate && (
                            <Button
                              variant="outline"
                              size="xs"
                              onClick={() => onAddProducingStep(candidate.key)}
                            >
                              <ArrowDownToLine /> {L.catalogueAddProducingStep}
                            </Button>
                          )}
                        </div>
                      </li>
                    )
                  })}
                </ul>
              )}
            </section>
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  )
}

function CatalogueSectionHeader({ title, count }: { title: string; count: number }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-muted-foreground text-[10px] font-semibold tracking-[0.12em] uppercase">
        {title}
      </span>
      <span className="bg-border h-px flex-1" aria-hidden="true" />
      <Badge variant="outline" className="px-1.5 text-[10px]">
        {count}
      </Badge>
    </div>
  )
}
