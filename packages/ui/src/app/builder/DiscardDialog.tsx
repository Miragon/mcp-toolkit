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
import type { LayoutBuilderLabels } from "./labels.js"

// -------------------------------------------------------------------------- //
// Discard confirmation
// -------------------------------------------------------------------------- //

/**
 * Asks before Discard takes the changes out of the view (CI §9: confirm
 * before an irreversible action). When a saved dashboard holds them
 * (`changesSaved`), it says so instead of calling them lost. The safe choice
 * comes first in the DOM, so the dialog opens with focus on "Keep editing";
 * closing it returns focus to Discard (the kit's `DialogContent` hands it
 * back to the element that opened it, see `lib/focus-return.ts`).
 */
export function DiscardDialog({
  L,
  open,
  onOpenChange,
  changesSaved,
  onConfirm,
}: {
  L: Required<LayoutBuilderLabels>
  open: boolean
  onOpenChange: (open: boolean) => void
  /** A saved dashboard holds the changes: only the view goes back. */
  changesSaved: boolean
  onConfirm: () => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{L.discardDialogTitle}</DialogTitle>
          <DialogDescription>
            {changesSaved ? L.discardDialogDescriptionSaved : L.discardDialogDescription}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">{L.keepEditing}</Button>
          </DialogClose>
          <Button variant="destructive" onClick={onConfirm}>
            {L.discardConfirm}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
