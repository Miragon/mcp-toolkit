import { memo, useMemo } from "react"
import { ArrowDownToLine, ArrowRightToLine, LucideProvider, Plus, X } from "lucide-react"
import type { AvailableStep, KeyCatalogEntry, PipelineStepRef } from "@miragon/mcp-toolkit-core"
import { DENSE_ICON_STROKE } from "../../lib/icon-stroke.js"
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
import {
  displayLabel,
  formatLiveKeyValue,
  valueTypeLabel,
  type DisplayKeyResolver,
  type KeyEntry,
} from "./builder-model.js"
import type { LayoutBuilderLabels, RefreshStatus } from "./labels.js"
import { StatusChip } from "./status-chip.js"
import { useDisplayResolver } from "./use-display-resolver.js"

// -------------------------------------------------------------------------- //
// Pipeline strip — the data sources (advanced mode): keys + steps
// -------------------------------------------------------------------------- //

type Labels = Required<LayoutBuilderLabels>

/** "needs a, b · provides c" in words (no arrow glyphs): a step's contract. */
function StepContract({ L, step }: { L: Labels; step: AvailableStep }) {
  return (
    <span className="text-muted-foreground flex flex-wrap gap-x-2 text-xs">
      <span>
        {L.catalogueNeedsKeys}{" "}
        <span className="font-mono">
          {step.requires.length ? step.requires.join(", ") : L.noInputs}
        </span>
      </span>
      <span>
        {L.stepProvides}{" "}
        <span className="font-mono">
          {step.produces.length ? step.produces.join(", ") : L.noOutputs}
        </span>
      </span>
    </span>
  )
}

function KeyRows({
  L,
  keyEntries,
  keyCatalog,
  liveKeys,
  onUpdateKey,
  onRemoveKey,
}: {
  L: Labels
  keyEntries: KeyEntry[]
  keyCatalog: KeyCatalogEntry[]
  liveKeys: Record<string, unknown>
  onUpdateKey: (idx: number, patch: Partial<KeyEntry>) => void
  onRemoveKey: (idx: number) => void
}) {
  return (
    <ul className="flex flex-col gap-1">
      {keyEntries.map((entry, idx) => {
        const livePreview = formatLiveKeyValue(liveKeys[entry.name], L.catalogueLive)
        const usedNames = new Set(
          keyEntries.map((e, i) => (i === idx ? "" : e.name)).filter(Boolean),
        )
        const pickable = keyCatalog.filter((c) => c.key === entry.name || !usedNames.has(c.key))
        return (
          <li key={idx} className="grid grid-cols-2 items-center gap-1">
            <Select
              value={entry.name || undefined}
              onValueChange={(value) => onUpdateKey(idx, { name: value })}
            >
              <SelectTrigger aria-label={L.keyName} className="h-7 min-w-0 font-mono text-xs">
                <SelectValue placeholder={L.keyName} />
              </SelectTrigger>
              <SelectContent>
                {pickable.length === 0 ? (
                  <div className="text-muted-foreground px-2 py-1.5 text-xs italic">
                    {L.noMoreKeys}
                  </div>
                ) : (
                  pickable.map((c) => (
                    <SelectItem key={c.key} value={c.key} className="py-1.5">
                      <div className="flex flex-col gap-0.5">
                        <span className="font-mono text-xs">{c.key}</span>
                        {c.consumedByWidgets.length + c.consumedBySteps.length > 0 && (
                          <span className="text-muted-foreground text-xs">
                            {L.catalogueConsumedBy}{" "}
                            <span className="font-mono">
                              {[...c.consumedByWidgets, ...c.consumedBySteps].join(", ")}
                            </span>
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
                  aria-label={L.keyValueFor(entry.name)}
                  value={entry.rawValue}
                  onChange={(e) => onUpdateKey(idx, { rawValue: e.target.value })}
                  placeholder={livePreview ?? L.keyValue}
                  className="h-7 pr-14 font-mono text-xs"
                />
                <span
                  className="text-muted-foreground pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 text-xs tabular-nums"
                  title={L.parsedType}
                >
                  {L.valueType(valueTypeLabel(entry.rawValue))}
                </span>
              </div>
              <Button
                variant="ghost"
                size="icon-xs"
                onClick={() => onRemoveKey(idx)}
                aria-label={L.removeKey}
              >
                <X aria-hidden="true" />
              </Button>
            </div>
          </li>
        )
      })}
    </ul>
  )
}

function StepRows({
  L,
  stepEntries,
  stepLookup,
  stepsByApp,
  locale,
  resolveKey,
  onUpdateStep,
  onRemoveStep,
}: {
  L: Labels
  stepEntries: PipelineStepRef[]
  stepLookup: Map<string, AvailableStep>
  stepsByApp: [string, AvailableStep[]][]
  locale: string
  resolveKey: DisplayKeyResolver
  onUpdateStep: (idx: number, patch: Partial<PipelineStepRef>) => void
  onRemoveStep: (idx: number) => void
}) {
  return (
    <ul className="flex flex-col gap-1">
      {stepEntries.map((step, idx) => {
        const meta = stepLookup.get(step.step)
        const selected = meta ? displayLabel(meta, meta.id, locale, resolveKey).label : step.step
        return (
          <li key={idx} className="flex flex-col gap-0.5">
            <div className="flex items-center gap-1">
              <Input
                aria-label={L.stepContextId}
                value={step.id}
                onChange={(e) => onUpdateStep(idx, { id: e.target.value })}
                placeholder={L.stepContextId}
                className="h-7 w-24 font-mono text-xs"
              />
              <Select
                value={step.step || undefined}
                onValueChange={(value) => onUpdateStep(idx, { step: value })}
              >
                <SelectTrigger
                  aria-label={L.stepPickerLabel}
                  className="h-7 min-w-0 flex-1 text-xs"
                >
                  {/* The trigger names the chosen step only; its contract follows below. */}
                  <SelectValue placeholder={L.stepPickerLabel}>
                    {step.step ? selected : null}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {stepsByApp.map(([app, items]) => (
                    <div key={app}>
                      <div className="text-muted-foreground px-2 py-1 text-xs font-semibold">
                        {app}
                      </div>
                      {items.map((s) => {
                        const name = displayLabel(s, s.id, locale, resolveKey)
                        return (
                          <SelectItem key={s.id} value={s.id} className="py-2">
                            <div className="flex flex-col gap-0.5">
                              <span className="text-xs font-medium">{name.label}</span>
                              {name.summary && (
                                <span className="text-muted-foreground text-xs">
                                  {name.summary}
                                </span>
                              )}
                              {name.hint && (
                                <span className="text-muted-foreground font-mono text-xs">
                                  {name.hint}
                                </span>
                              )}
                              <StepContract L={L} step={s} />
                            </div>
                          </SelectItem>
                        )
                      })}
                    </div>
                  ))}
                </SelectContent>
              </Select>
              <Button
                variant="ghost"
                size="icon-xs"
                onClick={() => onRemoveStep(idx)}
                aria-label={L.removeStep}
              >
                <X aria-hidden="true" />
              </Button>
            </div>
            {meta && (
              <div className="ml-1 pl-24">
                <StepContract L={L} step={meta} />
              </div>
            )}
          </li>
        )
      })}
    </ul>
  )
}

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
  L: Labels
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
  const { locale, resolveKey } = useDisplayResolver()
  const stepLookup = useMemo(() => {
    const map = new Map<string, AvailableStep>()
    for (const s of availableSteps) map.set(s.id, s)
    return map
  }, [availableSteps])

  return (
    <section className="bg-muted/30 -mx-1 rounded-lg border px-3 py-3">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <h3 className="text-muted-foreground text-xs font-semibold">{L.pipelineHeader}</h3>
        <span className="text-muted-foreground text-xs">{L.autoApplies}</span>
        <div className="ml-auto text-xs">
          <StatusChip status={status} L={L} />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-x-6 gap-y-3 lg:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <div className="text-muted-foreground flex items-center gap-1.5 text-xs font-semibold">
            <ArrowRightToLine aria-hidden="true" className="size-3.5" />
            {L.keysHeader}
            <Badge variant="outline" className="px-1.5 text-xs">
              {keyEntries.length}
            </Badge>
          </div>
          {keyEntries.length === 0 ? (
            <div className="text-muted-foreground rounded-md border border-dashed px-2 py-1.5 text-xs italic">
              {L.emptyKeys}
            </div>
          ) : (
            <KeyRows
              L={L}
              keyEntries={keyEntries}
              keyCatalog={keyCatalog}
              liveKeys={liveKeys}
              onUpdateKey={onUpdateKey}
              onRemoveKey={onRemoveKey}
            />
          )}
          <Button
            variant="ghost"
            size="xs"
            onClick={() => onAddKey()}
            className="text-muted-foreground hover:text-foreground self-start"
          >
            <Plus aria-hidden="true" /> {L.addKey}
          </Button>
        </div>

        <div className="flex flex-col gap-1.5">
          <div className="text-muted-foreground flex items-center gap-1.5 text-xs font-semibold">
            <ArrowDownToLine aria-hidden="true" className="size-3.5" />
            {L.stepsHeader}
            <Badge variant="outline" className="px-1.5 text-xs">
              {stepEntries.length}
            </Badge>
          </div>
          {stepEntries.length === 0 ? (
            <div className="text-muted-foreground rounded-md border border-dashed px-2 py-1.5 text-xs italic">
              {L.emptySteps}
            </div>
          ) : (
            <StepRows
              L={L}
              stepEntries={stepEntries}
              stepLookup={stepLookup}
              stepsByApp={stepsByApp}
              locale={locale}
              resolveKey={resolveKey}
              onUpdateStep={onUpdateStep}
              onRemoveStep={onRemoveStep}
            />
          )}
          <Button
            variant="ghost"
            size="xs"
            onClick={() => onAddStep()}
            disabled={availableSteps.length === 0}
            className="text-muted-foreground hover:text-foreground self-start"
          >
            <Plus aria-hidden="true" /> {L.addStep}
          </Button>
        </div>
      </div>
    </section>
  )
}

/** A dense chrome bar: its Lucide icons draw at stroke 2 (CI §11), not the view's 2.5. */
function DensePipelineStrip(props: Parameters<typeof PipelineStripImpl>[0]) {
  return (
    <LucideProvider strokeWidth={DENSE_ICON_STROKE}>
      <PipelineStripImpl {...props} />
    </LucideProvider>
  )
}

export const PipelineStrip = memo(DensePipelineStrip)
