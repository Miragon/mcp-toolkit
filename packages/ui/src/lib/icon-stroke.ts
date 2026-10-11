/**
 * Lucide stroke widths of the toolkit's chrome (CI §11, on the 24 px grid).
 * Set once through `LucideProvider`: `McpAppView` applies {@link ICON_STROKE}
 * to everything it renders (its toast stack included), dense bars narrow it
 * to {@link DENSE_ICON_STROKE}. Icons of a consumer's own `lucide-react` follow
 * the provider only when they resolve to the same module instance (dedupe it).
 */

/** Default stroke of the toolkit's icons. */
export const ICON_STROKE = 2.5

/** Stroke in dense chrome bars (the view toolbar, the builder's bars). */
export const DENSE_ICON_STROKE = 2
