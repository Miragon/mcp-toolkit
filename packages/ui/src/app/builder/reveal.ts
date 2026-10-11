/**
 * Secondary builder controls (row, tab and cell actions) stay quiet until the
 * pointer is over their group or focus is anywhere inside it, and are always
 * visible where nothing can hover (touch screens). Spread it on the controls'
 * container inside an element with `group`; a control that is never revealed
 * by hover alone is a CI §12 rule ("alles per Tastatur bedienbar"), guarded by
 * `builder-ux.test.tsx`.
 */
export const REVEAL_ON_INTENT =
  "opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 focus-within:opacity-100 [@media(hover:none)]:opacity-100"
