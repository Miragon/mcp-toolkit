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
 * Asks before unsaved changes are thrown away (CI §9: confirm before an
 * irreversible action). The safe choice comes first in the DOM, so the dialog
 * opens with focus on "Keep editing"; closing it returns focus to Discard.
 */
export function DiscardDialog({
  L,
  open,
  onOpenChange,
  onConfirm,
}: {
  L: Required<LayoutBuilderLabels>
  open: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: () => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{L.discardDialogTitle}</DialogTitle>
          <DialogDescription>{L.discardDialogDescription}</DialogDescription>
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
