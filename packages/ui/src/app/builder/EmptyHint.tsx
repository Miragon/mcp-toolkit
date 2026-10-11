import { Layers, SlidersHorizontal } from "lucide-react"
import { EmptyState } from "../../components/EmptyState.js"
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
    <EmptyState
      className="rounded-md border border-dashed"
      icon={<Layers />}
      title={L.emptyHintTitle}
      description={L.emptyHintBody}
      action={
        <Button variant="outline" size="sm" onClick={onGotoPipeline}>
          <SlidersHorizontal aria-hidden="true" /> {L.openDataSources}
        </Button>
      }
    />
  )
}
