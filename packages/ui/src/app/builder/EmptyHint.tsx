import { Layers, SlidersHorizontal } from "lucide-react"
import { Button } from "../../primitives/button.js"
import type { LayoutBuilderLabels } from "./labels.js"

// -------------------------------------------------------------------------- //
// Empty hint — shown on the Layout view before any widget is reachable
// -------------------------------------------------------------------------- //

export function EmptyHint({
  L,
  onGotoPipeline,
}: {
  L: Required<LayoutBuilderLabels>
  onGotoPipeline: () => void
}) {
  return (
    <div className="border-muted-foreground/30 text-muted-foreground flex flex-col items-center gap-2 rounded-md border border-dashed p-10 text-sm">
      <Layers className="size-5" />
      <p>No widgets reachable yet.</p>
      <p className="text-xs">
        Open the <span className="font-medium">{L.viewPipelineTab}</span> tab to seed keys or add a
        pipeline step — the palette unlocks as soon as a widget's contract is satisfied.
      </p>
      <Button variant="outline" size="sm" onClick={onGotoPipeline} className="mt-1">
        <SlidersHorizontal /> Open {L.viewPipelineTab}
      </Button>
    </div>
  )
}
