import { Layers, SlidersHorizontal } from "lucide-react"
import { EmptyState } from "../../components/EmptyState.js"
import { Button } from "../../primitives/button.js"
import type { LayoutBuilderLabels } from "./labels.js"

// -------------------------------------------------------------------------- //
// Empty hint — shown on the Layout view before any widget is reachable
// -------------------------------------------------------------------------- //

/**
 * The builder's empty state. Its one next step (open the data sources) is the
 * blue primary button: CI §9 "Leer: Empty-State-Karte mit blauem CTA".
 */
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
        <Button size="sm" onClick={onGotoPipeline}>
          <SlidersHorizontal aria-hidden="true" /> {L.openDataSources}
        </Button>
      }
    />
  )
}
