/**
 * Shared label contract for the visual LayoutBuilder.
 *
 * Extracted from `layout-builder.tsx` so the presentational sub-components
 * (Toolbar, PipelineStrip, Workspace, CatalogueSheet, SaveDialog, PreviewPane)
 * can depend on the labels without importing the orchestrating container —
 * which would create an import cycle. React-free and `mcp-use`-free. The
 * strings themselves live in the toolkit catalog (`locale/messages-*.ts`).
 */

import { TOOLKIT_MESSAGES, type BuilderMessages } from "../../locale/toolkit-messages.js"

/**
 * Override strings for every user-facing caption in the builder. Each field
 * defaults to the active locale's toolkit catalog (`useToolkitMessages().builder`).
 */
export type LayoutBuilderLabels = Partial<BuilderMessages>

/**
 * English builder strings.
 * @deprecated Read the active locale's strings with `useToolkitMessages().builder`
 * (or `TOOLKIT_MESSAGES.en.builder`); this alias stays for existing imports.
 */
export const DEFAULT_LABELS: Required<LayoutBuilderLabels> = TOOLKIT_MESSAGES.en.builder

/**
 * MIME type used to carry a widget id across the palette → canvas drag.
 * Shared between the palette items and the canvas drop targets.
 */
export const WIDGET_DRAG_MIME = "application/x-mcp-widget-id"

/** Refresh status for the auto-apply chip and the pipeline strip. */
export type RefreshStatus = "idle" | "pending" | "refreshing"
