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
import { useToolkitMessages } from "../locale/locale-provider.js"
import type { PropsSheetMessages } from "../locale/toolkit-messages.js"
import { propFieldText, type PropFieldText } from "./builder/builder-model.js"
import { useDisplayResolver } from "./builder/use-display-resolver.js"

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
 * Each field is labelled in user words: the property's `x-display` title
 * (`PROPS_SCHEMA_DISPLAY_KEYWORD`, a key or per-locale text), else its JSON
 * Schema `title`, else its name; the raw property name then follows as a
 * quiet hint, and the help line is the `x-display` summary or the
 * `description`.
 *
 * The sheet writes a clean `Record<string, unknown>` (empty values
 * stripped) and reports `undefined` when the user clears every field, so
 * the cell's `props` field stays absent rather than `{}` — matches the
 * "no props" wire format used elsewhere.
 */

interface JsonSchemaProperty {
  type?: string
  title?: string
  description?: string
  enum?: unknown[]
  default?: unknown
}

interface JsonSchemaObject {
  type?: string
  properties?: Record<string, JsonSchemaProperty>
  required?: string[]
}

/** Override strings of the sheet; each defaults to the locale's `propsSheet` catalog. */
export type WidgetPropsSheetLabels = Partial<PropsSheetMessages>

const UNSET_SENTINEL = "__unset__"

export interface WidgetPropsSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  widgetId: string
  /** The widget's human name (its title); the id then shows as a quiet hint under it. */
  widgetTitle?: string
  schema: Record<string, unknown> | undefined
  value: Record<string, unknown> | undefined
  onApply: (next: Record<string, unknown> | undefined) => void
  labels?: WidgetPropsSheetLabels
}

export function WidgetPropsSheet({
  open,
  onOpenChange,
  widgetId,
  widgetTitle,
  schema,
  value,
  onApply,
  labels,
}: WidgetPropsSheetProps) {
  const messages = useToolkitMessages()
  const { locale, resolveKey } = useDisplayResolver()
  const L = { ...messages.propsSheet, ...labels }
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
          <SheetDescription className="flex flex-col items-start gap-1">
            <span>{L.description}</span>
            {widgetTitle && <span className="text-foreground font-medium">{widgetTitle}</span>}
            <span className="bg-muted text-small rounded px-1 font-mono">{widgetId}</span>
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
                text={propFieldText(key, prop as Record<string, unknown>, locale, resolveKey)}
                prop={prop}
                value={draft[key]}
                unsetLabel={L.unsetOption}
                unsupportedLabel={L.unsupportedType}
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
  text,
  prop,
  value,
  unsetLabel,
  unsupportedLabel,
  onChange,
}: {
  name: string
  text: PropFieldText
  prop: JsonSchemaProperty
  value: unknown
  unsetLabel: string
  unsupportedLabel: (type: string) => string
  onChange: (v: unknown) => void
}) {
  const id = `prop-${name}`

  if (prop.type === "string" && Array.isArray(prop.enum)) {
    const options = prop.enum.filter((v): v is string => typeof v === "string")
    const current = typeof value === "string" && value !== "" ? value : UNSET_SENTINEL
    return (
      <FieldShell id={id} text={text}>
        <Select
          value={current}
          onValueChange={(v) => onChange(v === UNSET_SENTINEL ? undefined : v)}
        >
          <SelectTrigger id={id} aria-describedby={helpId(id, text)}>
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
      <FieldShell id={id} text={text}>
        <Input
          id={id}
          aria-describedby={helpId(id, text)}
          value={current}
          onChange={(e) => onChange(e.target.value === "" ? undefined : e.target.value)}
        />
      </FieldShell>
    )
  }

  if (prop.type === "number" || prop.type === "integer") {
    const current = typeof value === "number" ? String(value) : ""
    return (
      <FieldShell id={id} text={text}>
        <Input
          id={id}
          aria-describedby={helpId(id, text)}
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
      <FieldShell id={id} text={text}>
        <Switch
          id={id}
          aria-describedby={helpId(id, text)}
          checked={current}
          onCheckedChange={(checked) => onChange(checked || undefined)}
        />
      </FieldShell>
    )
  }

  return (
    <FieldShell id={id} text={text}>
      <p className="text-muted-foreground text-small italic">
        {unsupportedLabel(prop.type ?? "?")}
      </p>
    </FieldShell>
  )
}

/** The id of a field's help line, when it has one (its `aria-describedby`). */
function helpId(id: string, text: PropFieldText): string | undefined {
  return text.help ? `${id}-help` : undefined
}

/**
 * Label (the human title), the raw property name as a quiet hint beside it
 * (outside the label, so the accessible name stays the title), the control,
 * and the help line it is described by.
 */
function FieldShell({
  id,
  text,
  children,
}: {
  id: string
  text: PropFieldText
  children: ReactNode
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-baseline gap-x-2">
        <label htmlFor={id} className="text-sm font-medium">
          {text.label}
        </label>
        {text.hint && (
          <code data-slot="prop-name" className="text-muted-foreground text-small font-mono">
            {text.hint}
          </code>
        )}
      </div>
      {children}
      {text.help ? (
        <p id={helpId(id, text)} className="text-muted-foreground text-small">
          {text.help}
        </p>
      ) : null}
    </div>
  )
}
