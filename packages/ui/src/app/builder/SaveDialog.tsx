import { ErrorState } from "../../components/ErrorState.js"
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

/**
 * Names the draft and saves it as a dashboard. Its description mentions Apply
 * only where there is one (`canApply`: the builder has an `onExit`). Opens
 * with the focus on the name field and hands it back to "Save as dashboard"
 * when it closes.
 */
export function SaveDialog({
  L,
  open,
  onOpenChange,
  canApply,
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
  /** The builder has a view to apply the draft to (an `onExit`). */
  canApply: boolean
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
          <DialogDescription>
            {canApply ? L.saveDialogDescription : L.saveDialogDescriptionStandalone}
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">{L.saveNameLabel}</span>
            {/* No autoFocus: the dialog focuses this first field itself, and
                only then notes where to hand the focus back on close. */}
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={L.saveNamePlaceholder}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">{L.saveDescriptionLabel}</span>
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={L.saveDescriptionPlaceholder}
            />
          </label>
          {/* What happened and what to do in catalog words; the raw reason
              only under Details. The Save button below is the retry. */}
          {error && (
            <ErrorState
              variant="inline"
              title={L.saveError}
              description={L.saveErrorHint}
              details={error}
            />
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
