import { useEffect, useRef, type RefObject } from "react"

/** Where focus goes when build mode opens: the builder's title. */
export const BUILDER_FOCUS_TARGET = '[data-slot="builder-title"]'
/** Where focus goes when build mode closes (Apply or Discard): the edit button that opened it. */
export const VIEW_FOCUS_TARGET = '[data-slot="view-edit"]'

/**
 * The selector focus moves to when build mode switches, or `null` when it
 * did not switch (the first render included). Pure, so the hand-off is
 * unit-testable without a DOM.
 */
export function buildModeFocusTarget(previous: boolean, current: boolean): string | null {
  if (previous === current) return null
  return current ? BUILDER_FOCUS_TARGET : VIEW_FOCUS_TARGET
}

/**
 * Moves focus across the build-mode switch: the button that opened the
 * builder disappears with the toolbar, so focus lands on the builder's title;
 * Apply and Discard unmount the builder, so focus returns to the edit button.
 * Focus that already sits outside the view (another frame, the host) stays
 * where it is.
 */
export function useBuildModeFocus(
  buildMode: boolean,
  frameRef: RefObject<HTMLElement | null>,
): void {
  const previous = useRef(buildMode)
  useEffect(() => {
    const target = buildModeFocusTarget(previous.current, buildMode)
    previous.current = buildMode
    const frame = frameRef.current
    if (!target || !frame) return
    const active = frame.ownerDocument.activeElement
    if (active && active !== frame.ownerDocument.body && !frame.contains(active)) return
    frame.querySelector<HTMLElement>(target)?.focus()
  }, [buildMode, frameRef])
}
