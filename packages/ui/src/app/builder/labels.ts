/**
 * Shared label contract for the visual LayoutBuilder.
 *
 * Extracted from `layout-builder.tsx` so the presentational sub-components
 * (Toolbar, PipelineStrip, Workspace, CatalogueSheet, SaveDialog, PreviewPane)
 * can depend on the labels without importing the orchestrating container —
 * which would create an import cycle. React-free and `mcp-use`-free.
 */

export interface LayoutBuilderLabels {
  title?: string
  builderBadge?: string
  previewBadge?: string
  catalogue?: string
  save?: string
  done?: string
  viewLayoutTab?: string
  viewPipelineTab?: string
  viewPreviewTab?: string
  saveDialogTitle?: string
  saveDialogDescription?: string
  saveNameLabel?: string
  saveDescriptionLabel?: string
  saveConfirm?: string
  cancel?: string
  pipelineHeader?: string
  keysHeader?: string
  stepsHeader?: string
  keyName?: string
  keyValue?: string
  stepContextId?: string
  stepPickerLabel?: string
  addKey?: string
  addStep?: string
  emptyKeys?: string
  emptySteps?: string
  statusUpToDate?: string
  statusPending?: string
  statusRefreshing?: string
  paletteHeader?: string
  paletteEmpty?: string
  canvasEmpty?: string
  canvasDropHint?: string
  addRow?: string
  addTab?: string
  removeRow?: string
  renameTab?: string
  removeTab?: string
  tabsLabel?: string
  catalogueDescription?: string
  catalogueKeys?: string
  catalogueSteps?: string
  catalogueUnreachable?: string
  catalogueUnreachableEmpty?: string
  catalogueProducedBy?: string
  catalogueConsumedBy?: string
  catalogueNeedsKeys?: string
  cataloguePickKey?: string
  catalogueAddProducingStep?: string
  catalogueLive?: string
  catalogueMissing?: string
  /** Banner shown when the catalogue fetch fails (prefixes the reason). */
  catalogueError?: string
  /** Heading for the pipeline-validation warning banner. */
  validationWarning?: string
  /** Inline message when a save fails (prefixes the reason). */
  saveError?: string
  /** Inline message when a tab rename is rejected (duplicate label). */
  renameDuplicate?: string
}

export const DEFAULT_LABELS: Required<LayoutBuilderLabels> = {
  title: "View Builder",
  builderBadge: "Builder",
  previewBadge: "Preview",
  catalogue: "Catalogue",
  save: "Save",
  done: "Done",
  viewLayoutTab: "Layout",
  viewPipelineTab: "Pipeline",
  viewPreviewTab: "Preview",
  saveDialogTitle: "Save dashboard",
  saveDialogDescription:
    "Persists the current layout along with the keys and steps that populate it.",
  saveNameLabel: "Name",
  saveDescriptionLabel: "Description",
  saveConfirm: "Save dashboard",
  cancel: "Cancel",
  pipelineHeader: "Pipeline",
  keysHeader: "Keys",
  stepsHeader: "Steps",
  keyName: "key",
  keyValue: 'value, "literal", true, {…}',
  stepContextId: "ctx id",
  stepPickerLabel: "pick a step",
  addKey: "Add key",
  addStep: "Add step",
  emptyKeys: "No keys seeded.",
  emptySteps: "No steps configured.",
  statusUpToDate: "Up to date",
  statusPending: "Applying soon…",
  statusRefreshing: "Applying…",
  paletteHeader: "Palette",
  paletteEmpty: "No widgets reachable yet — seed a key or add a step.",
  canvasEmpty: "Drag a widget here, or click one in the palette.",
  canvasDropHint: "Drop to add",
  addRow: "Add row",
  addTab: "Add tab",
  removeRow: "Remove row",
  renameTab: "Rename tab",
  removeTab: "Remove tab",
  tabsLabel: "Tabs",
  catalogueDescription:
    "Every key and widget the framework knows about, whether or not it's reachable right now.",
  catalogueKeys: "Keys",
  catalogueSteps: "Steps",
  catalogueUnreachable: "Unreachable widgets",
  catalogueUnreachableEmpty: "Every registered widget is reachable.",
  catalogueProducedBy: "produced by",
  catalogueConsumedBy: "consumed by",
  catalogueNeedsKeys: "needs",
  cataloguePickKey: "Add as key",
  catalogueAddProducingStep: "Add producing step",
  catalogueLive: "live",
  catalogueMissing: "missing",
  catalogueError: "Couldn't refresh the builder catalogue",
  validationWarning: "This pipeline won't render as configured",
  saveError: "Couldn't save",
  renameDuplicate: "A tab with that name already exists.",
}

/**
 * MIME type used to carry a widget id across the palette → canvas drag.
 * Shared between the palette items and the canvas drop targets.
 */
export const WIDGET_DRAG_MIME = "application/x-mcp-widget-id"

/** Refresh status for the auto-apply chip and the pipeline strip. */
export type RefreshStatus = "idle" | "pending" | "refreshing"
