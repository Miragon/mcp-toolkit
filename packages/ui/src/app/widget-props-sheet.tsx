import { useState, type ReactNode } from "react"
import { Button } from "../primitives/button.js"
import { Input } from "../primitives/input.js"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../primitives/select.js"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "../primitives/sheet.js"
import { Switch } from "../primitives/switch.js"

/**
 * Tiny JSON-Schema-driven editor for a layout cell's `props`. The
 * LayoutBuilder opens this sheet when the user clicks "Configure" on a
 * cell whose widget advertises a `propsSchema` in the framework manifest.
 *
 * Scope (v1):
 *   - Object-root schemas only.
 *   - Top-level properties: `string`, `number`, `integer`, `boolean`.
 *   - String enums render as a Select.
 *   - Nested objects/arrays/$ref/anyOf are not supported — the field
 *     shows an "edit JSON manually" hint so authors know to fall back.
 *
 * The sheet writes a clean `Record<string, unknown>` (empty values
 * stripped) and reports `undefined` when the user clears every field, so
 * the cell's `props` field stays absent rather than `{}` — matches the
 * "no props" wire format used elsewhere.
 */

interface JsonSchemaProperty {
  type?: string
  description?: string
  enum?: unknown[]
  default?: unknown
}

interface JsonSchemaObject {
  type?: string
  properties?: Record<string, JsonSchemaProperty>
  required?: string[]
}

export interface WidgetPropsSheetLabels {
  title?: string
  description?: string
  apply?: string
  cancel?: string
  reset?: string
  noProps?: string
  unsetOption?: string
}

const DEFAULT_LABELS: Required<WidgetPropsSheetLabels> = {
  title: "Configure widget",
  description: "Set per-instance props for this widget.",
  apply: "Apply",
  cancel: "Cancel",
  reset: "Reset",
  noProps: "This widget takes no per-instance props.",
  unsetOption: "(unset)",
}

const UNSET_SENTINEL = "__unset__"

export interface WidgetPropsSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  widgetId: string
  schema: Record<string, unknown> | undefined
  value: Record<string, unknown> | undefined
  onApply: (next: Record<string, unknown> | undefined) => void
  labels?: WidgetPropsSheetLabels
}

export function WidgetPropsSheet({
  open,
  onOpenChange,
  widgetId,
  schema,
  value,
  onApply,
  labels,
}: WidgetPropsSheetProps) {
  const L = { ...DEFAULT_LABELS, ...labels }
  const obj = (schema ?? {}) as JsonSchemaObject
  const [draft, setDraft] = useState<Record<string, unknown>>(value ?? {})

  // Reset the form to the saved value on the open→true transition so a
  // user who closes the sheet without applying gets their unsaved edits
  // discarded next time. Render-time state update with a "prev" tracker
  // is the React-recommended alternative to a setState-in-effect.
  const [prevOpen, setPrevOpen] = useState(open)
  if (open !== prevOpen) {
    setPrevOpen(open)
    if (open) setDraft(value ?? {})
  }

  const properties = obj.properties ?? {}
  const propEntries = Object.entries(properties)

  const handleApply = () => {
    const cleaned: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(draft)) {
      if (v === "" || v === undefined || v === null) continue
      cleaned[k] = v
    }
    onApply(Object.keys(cleaned).length > 0 ? cleaned : undefined)
    onOpenChange(false)
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-[400px] sm:max-w-md">
        <SheetHeader>
          <SheetTitle>{L.title}</SheetTitle>
          <SheetDescription>
            <span className="bg-muted rounded px-1 font-mono text-xs">{widgetId}</span> —{" "}
            {L.description}
          </SheetDescription>
        </SheetHeader>
        <div className="flex flex-col gap-4 px-4 py-4">
          {propEntries.length === 0 ? (
            <p className="text-muted-foreground text-sm">{L.noProps}</p>
          ) : (
            propEntries.map(([key, prop]) => (
              <PropertyField
                key={key}
                name={key}
                prop={prop}
                value={draft[key]}
                unsetLabel={L.unsetOption}
                onChange={(v) =>
                  setDraft((prev) => {
                    if (v === undefined) {
                      const rest: Record<string, unknown> = {}
                      for (const [k, val] of Object.entries(prev)) {
                        if (k !== key) rest[k] = val
                      }
                      return rest
                    }
                    return { ...prev, [key]: v }
                  })
                }
              />
            ))
          )}
        </div>
        <div className="flex items-center justify-end gap-2 border-t px-4 py-3">
          <Button variant="ghost" onClick={() => setDraft({})}>
            {L.reset}
          </Button>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {L.cancel}
          </Button>
          <Button onClick={handleApply}>{L.apply}</Button>
        </div>
      </SheetContent>
    </Sheet>
  )
}

function PropertyField({
  name,
  prop,
  value,
  unsetLabel,
  onChange,
}: {
  name: string
  prop: JsonSchemaProperty
  value: unknown
  unsetLabel: string
  onChange: (v: unknown) => void
}) {
  const id = `prop-${name}`

  if (prop.type === "string" && Array.isArray(prop.enum)) {
    const options = prop.enum.filter((v): v is string => typeof v === "string")
    const current = typeof value === "string" && value !== "" ? value : UNSET_SENTINEL
    return (
      <FieldShell id={id} name={name} description={prop.description}>
        <Select
          value={current}
          onValueChange={(v) => onChange(v === UNSET_SENTINEL ? undefined : v)}
        >
          <SelectTrigger id={id}>
            <SelectValue placeholder={unsetLabel} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={UNSET_SENTINEL}>{unsetLabel}</SelectItem>
            {options.map((opt) => (
              <SelectItem key={opt} value={opt}>
                {opt}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FieldShell>
    )
  }

  if (prop.type === "string") {
    const current = typeof value === "string" ? value : ""
    return (
      <FieldShell id={id} name={name} description={prop.description}>
        <Input
          id={id}
          value={current}
          onChange={(e) => onChange(e.target.value === "" ? undefined : e.target.value)}
        />
      </FieldShell>
    )
  }

  if (prop.type === "number" || prop.type === "integer") {
    const current = typeof value === "number" ? String(value) : ""
    return (
      <FieldShell id={id} name={name} description={prop.description}>
        <Input
          id={id}
          type="number"
          value={current}
          onChange={(e) => {
            const raw = e.target.value
            if (raw === "") return onChange(undefined)
            const parsed =
              prop.type === "integer" ? Number.parseInt(raw, 10) : Number.parseFloat(raw)
            if (Number.isFinite(parsed)) onChange(parsed)
          }}
        />
      </FieldShell>
    )
  }

  if (prop.type === "boolean") {
    const current = value === true
    return (
      <FieldShell id={id} name={name} description={prop.description}>
        <Switch
          id={id}
          checked={current}
          onCheckedChange={(checked) => onChange(checked || undefined)}
        />
      </FieldShell>
    )
  }

  return (
    <FieldShell id={id} name={name} description={prop.description}>
      <p className="text-muted-foreground text-xs italic">
        Unsupported type "{prop.type ?? "(none)"}" — edit raw JSON to set this field.
      </p>
    </FieldShell>
  )
}

function FieldShell({
  id,
  name,
  description,
  children,
}: {
  id: string
  name: string
  description?: string
  children: ReactNode
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium">
        {name}
      </label>
      {children}
      {description ? <p className="text-muted-foreground text-xs">{description}</p> : null}
    </div>
  )
}
