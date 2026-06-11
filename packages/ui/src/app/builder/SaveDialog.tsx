import { AlertTriangle } from "lucide-react"
import { Button } from "../../primitives/button.js"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../primitives/dialog.js"
import { Input } from "../../primitives/input.js"
import type { LayoutBuilderLabels } from "./labels.js"

// -------------------------------------------------------------------------- //
// Save dialog
// -------------------------------------------------------------------------- //

export function SaveDialog({
  L,
  open,
  onOpenChange,
  name,
  setName,
  description,
  setDescription,
  onSubmit,
  busy,
  error,
}: {
  L: Required<LayoutBuilderLabels>
  open: boolean
  onOpenChange: (open: boolean) => void
  name: string
  setName: (v: string) => void
  description: string
  setDescription: (v: string) => void
  onSubmit: () => Promise<void>
  busy: boolean
  error: string | null
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{L.saveDialogTitle}</DialogTitle>
          <DialogDescription>{L.saveDialogDescription}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">{L.saveNameLabel}</span>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Invoice overview"
              autoFocus
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">{L.saveDescriptionLabel}</span>
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional"
            />
          </label>
          {error && (
            <div
              className="border-destructive/30 bg-destructive/10 text-destructive flex items-start gap-2 rounded-md border px-3 py-2 text-xs"
              role="alert"
            >
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
              <span className="min-w-0 break-words">
                <span className="font-medium">{L.saveError}:</span> {error}
              </span>
            </div>
          )}
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">{L.cancel}</Button>
          </DialogClose>
          <Button
            disabled={!name.trim() || busy}
            onClick={() => {
              void onSubmit()
            }}
          >
            {L.saveConfirm}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
