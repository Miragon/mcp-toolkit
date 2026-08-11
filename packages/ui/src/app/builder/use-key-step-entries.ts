import { useCallback, useState } from "react"
import type { PipelineStepRef } from "@miragon/mcp-toolkit-core"
import { defaultStepIdFor, keysToEntries, type KeyEntry } from "./builder-model.js"

// -------------------------------------------------------------------------- //
// Keys + steps editor state — the pipeline tab's editable entry lists
// -------------------------------------------------------------------------- //

/**
 * Owns the key/step editor entries and their mutations, extracted from
 * `layout-builder.tsx` unchanged. `addKey` de-dupes a prefilled name (the
 * catalogue's "Add as key" action) and `addStep` derives a unique context
 * id via `defaultStepIdFor`.
 */
export function useKeyStepEntries({
  initialKeys,
  initialSteps,
}: {
  initialKeys?: Record<string, unknown>
  initialSteps?: PipelineStepRef[]
}) {
  const [keyEntries, setKeyEntries] = useState<KeyEntry[]>(() => keysToEntries(initialKeys))
  const [stepEntries, setStepEntries] = useState<PipelineStepRef[]>(() => initialSteps ?? [])

  const addKey = useCallback((prefilledName?: string) => {
    setKeyEntries((prev) => {
      if (prefilledName) {
        if (prev.some((e) => e.name === prefilledName)) return prev
        return [...prev, { name: prefilledName, rawValue: "" }]
      }
      return [...prev, { name: "", rawValue: "" }]
    })
  }, [])

  const updateKey = useCallback((idx: number, patch: Partial<KeyEntry>) => {
    setKeyEntries((prev) => prev.map((e, i) => (i === idx ? { ...e, ...patch } : e)))
  }, [])

  const removeKey = useCallback((idx: number) => {
    setKeyEntries((prev) => prev.filter((_, i) => i !== idx))
  }, [])

  const addStep = useCallback((stepId?: string) => {
    setStepEntries((prev) => {
      const taken = new Set(prev.map((s) => s.id))
      const newId = stepId ? defaultStepIdFor(stepId, taken) : `step-${prev.length + 1}`
      return [...prev, { id: newId, step: stepId ?? "", optional: false }]
    })
  }, [])

  const updateStep = useCallback((idx: number, patch: Partial<PipelineStepRef>) => {
    setStepEntries((prev) => prev.map((s, i) => (i === idx ? { ...s, ...patch } : s)))
  }, [])

  const removeStep = useCallback((idx: number) => {
    setStepEntries((prev) => prev.filter((_, i) => i !== idx))
  }, [])

  return { keyEntries, stepEntries, addKey, updateKey, removeKey, addStep, updateStep, removeStep }
}
