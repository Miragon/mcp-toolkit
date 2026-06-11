import { memo, useMemo } from "react"
import { ArrowDownToLine, ArrowRightToLine, Plus, X } from "lucide-react"
import type { AvailableStep, KeyCatalogEntry, PipelineStepRef } from "@miragon/mcp-toolkit-core"
import { Badge } from "../../primitives/badge.js"
import { Button } from "../../primitives/button.js"
import { Input } from "../../primitives/input.js"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../primitives/select.js"
import { formatLiveKeyValue, valueTypeLabel, type KeyEntry } from "./builder-model.js"
import type { LayoutBuilderLabels, RefreshStatus } from "./labels.js"
import { StatusChip } from "./status-chip.js"

// -------------------------------------------------------------------------- //
// Pipeline strip — compact horizontal Keys + Steps
// -------------------------------------------------------------------------- //

function PipelineStripImpl({
  L,
  keyEntries,
  stepEntries,
  keyCatalog,
  availableSteps,
  stepsByApp,
  liveKeys,
  onAddKey,
  onUpdateKey,
  onRemoveKey,
  onAddStep,
  onUpdateStep,
  onRemoveStep,
  status,
}: {
  L: Required<LayoutBuilderLabels>
  keyEntries: KeyEntry[]
  stepEntries: PipelineStepRef[]
  keyCatalog: KeyCatalogEntry[]
  availableSteps: AvailableStep[]
  stepsByApp: [string, AvailableStep[]][]
  liveKeys: Record<string, unknown>
  onAddKey: (prefilledName?: string) => void
  onUpdateKey: (idx: number, patch: Partial<KeyEntry>) => void
  onRemoveKey: (idx: number) => void
  onAddStep: (stepId?: string) => void
  onUpdateStep: (idx: number, patch: Partial<PipelineStepRef>) => void
  onRemoveStep: (idx: number) => void
  status: RefreshStatus
}) {
  const stepLookup = useMemo(() => {
    const map = new Map<string, AvailableStep>()
    for (const s of availableSteps) map.set(s.id, s)
    return map
  }, [availableSteps])

  return (
    <section className="bg-muted/30 -mx-1 rounded-lg border px-3 py-3">
      <div className="mb-2 flex items-center gap-2">
        <span className="text-muted-foreground text-[10px] font-semibold tracking-[0.12em] uppercase">
          {L.pipelineHeader}
        </span>
        <span className="text-muted-foreground/60 text-[10px]">· auto-applies on edit</span>
        <div className="ml-auto text-[11px]">
          <StatusChip status={status} L={L} />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-x-6 gap-y-3 lg:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <div className="text-muted-foreground flex items-center gap-1.5 text-[11px] font-semibold">
            <ArrowRightToLine className="size-3" />
            {L.keysHeader}
            <Badge variant="outline" className="px-1.5 text-[10px]">
              {keyEntries.length}
            </Badge>
          </div>
          {keyEntries.length === 0 ? (
            <div className="text-muted-foreground rounded-md border border-dashed px-2 py-1.5 text-xs italic">
              {L.emptyKeys}
            </div>
          ) : (
            <ul className="flex flex-col gap-1">
              {keyEntries.map((entry, idx) => {
                const livePreview = formatLiveKeyValue(liveKeys[entry.name])
                const usedNames = new Set(
                  keyEntries.map((e, i) => (i === idx ? "" : e.name)).filter(Boolean),
                )
                const pickable = keyCatalog.filter(
                  (c) => c.key === entry.name || !usedNames.has(c.key),
                )
                return (
                  <li key={idx} className="grid grid-cols-2 items-center gap-1">
                    <Select
                      value={entry.name || undefined}
                      onValueChange={(value) => onUpdateKey(idx, { name: value })}
                    >
                      <SelectTrigger className="h-7 min-w-0 font-mono text-xs">
                        <SelectValue placeholder={L.keyName} />
                      </SelectTrigger>
                      <SelectContent>
                        {pickable.length === 0 ? (
                          <div className="text-muted-foreground px-2 py-1.5 text-xs italic">
                            No more keys available.
                          </div>
                        ) : (
                          pickable.map((c) => (
                            <SelectItem key={c.key} value={c.key} className="py-1.5">
                              <div className="flex flex-col gap-0.5">
                                <span className="font-mono text-xs">{c.key}</span>
                                {c.consumedByWidgets.length + c.consumedBySteps.length > 0 && (
                                  <span className="text-muted-foreground/80 font-mono text-[10px]">
                                    → {[...c.consumedByWidgets, ...c.consumedBySteps].join(", ")}
                                  </span>
                                )}
                              </div>
                            </SelectItem>
                          ))
                        )}
                      </SelectContent>
                    </Select>
                    <div className="flex min-w-0 items-center gap-1">
                      <div className="relative min-w-0 flex-1">
                        <Input
                          value={entry.rawValue}
                          onChange={(e) => onUpdateKey(idx, { rawValue: e.target.value })}
                          placeholder={livePreview ?? L.keyValue}
                          className="h-7 pr-10 font-mono text-xs"
                        />
                        <span
                          className="text-muted-foreground/70 pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 font-mono text-[10px] tabular-nums"
                          title="parsed type"
                        >
                          {valueTypeLabel(entry.rawValue)}
                        </span>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        onClick={() => onRemoveKey(idx)}
                        aria-label="Remove key"
                      >
                        <X />
                      </Button>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
          <Button
            variant="ghost"
            size="xs"
            onClick={() => onAddKey()}
            className="text-muted-foreground hover:text-foreground self-start"
          >
            <Plus /> {L.addKey}
          </Button>
        </div>

        <div className="flex flex-col gap-1.5">
          <div className="text-muted-foreground flex items-center gap-1.5 text-[11px] font-semibold">
            <ArrowDownToLine className="size-3" />
            {L.stepsHeader}
            <Badge variant="outline" className="px-1.5 text-[10px]">
              {stepEntries.length}
            </Badge>
          </div>
          {stepEntries.length === 0 ? (
            <div className="text-muted-foreground rounded-md border border-dashed px-2 py-1.5 text-xs italic">
              {L.emptySteps}
            </div>
          ) : (
            <ul className="flex flex-col gap-1">
              {stepEntries.map((step, idx) => {
                const meta = stepLookup.get(step.step)
                return (
                  <li key={idx} className="flex flex-col gap-0.5">
                    <div className="flex items-center gap-1">
                      <Input
                        value={step.id}
                        onChange={(e) => onUpdateStep(idx, { id: e.target.value })}
                        placeholder={L.stepContextId}
                        className="h-7 w-24 font-mono text-xs"
                      />
                      <Select
                        value={step.step || undefined}
                        onValueChange={(value) => onUpdateStep(idx, { step: value })}
                      >
                        <SelectTrigger className="h-7 flex-1 text-xs">
                          <SelectValue placeholder={L.stepPickerLabel} />
                        </SelectTrigger>
                        <SelectContent>
                          {stepsByApp.map(([app, items]) => (
                            <div key={app}>
                              <div className="text-muted-foreground px-2 py-1 text-[10px] font-semibold tracking-wide uppercase">
                                {app}
                              </div>
                              {items.map((s) => (
                                <SelectItem key={s.id} value={s.id} className="py-2">
                                  <div className="flex flex-col gap-0.5">
                                    <span className="font-mono text-xs">{s.id}</span>
                                    <div className="text-muted-foreground flex flex-wrap gap-x-2 text-[10px]">
                                      <span className="font-mono">
                                        ←{" "}
                                        {s.requires.length ? s.requires.join(", ") : "(no inputs)"}
                                      </span>
                                      <span className="font-mono">
                                        → {s.produces.length ? s.produces.join(", ") : "(none)"}
                                      </span>
                                    </div>
                                  </div>
                                </SelectItem>
                              ))}
                            </div>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        onClick={() => onRemoveStep(idx)}
                        aria-label="Remove step"
                      >
                        <X />
                      </Button>
                    </div>
                    {meta && (
                      <div className="text-muted-foreground/80 ml-1 flex flex-wrap gap-x-2 pl-24 text-[10px]">
                        <span className="font-mono">
                          ← {meta.requires.length ? meta.requires.join(", ") : "(no inputs)"}
                        </span>
                        <span className="font-mono">
                          → {meta.produces.length ? meta.produces.join(", ") : "(none)"}
                        </span>
                      </div>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
          <Button
            variant="ghost"
            size="xs"
            onClick={() => onAddStep()}
            disabled={availableSteps.length === 0}
            className="text-muted-foreground hover:text-foreground self-start"
          >
            <Plus /> {L.addStep}
          </Button>
        </div>
      </div>
    </section>
  )
}

export const PipelineStrip = memo(PipelineStripImpl)
