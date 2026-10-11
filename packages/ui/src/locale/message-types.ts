/**
 * The shapes of the toolkit's message catalogs (see `toolkit-messages.ts`).
 * Types only, kept apart from the catalogs so `messages-en.ts` /
 * `messages-de.ts` can implement them without an import cycle.
 */

/** Strings shared by several components. */
export interface CommonMessages {
  /** Accessible name of the close button in dialogs and sheets. */
  close: string
  /** Retry action of error states. */
  retry: string
  /** Summary of a technical-details disclosure. */
  details: string
  /** Accessible name of a toast's close button. */
  dismiss: string
  /**
   * @deprecated No longer rendered: the toast region is a plain live region
   * with fixed attributes and takes no name. Kept so a catalog that sets it
   * still type-checks.
   */
  notifications: string
  /** Title of a widget's error state when its data could not be loaded. */
  loadFailed: string
  /** The line under {@link CommonMessages.loadFailed}: what you can do (a retry follows). */
  loadFailedHint: string
}

/** Strings of the `McpAppView` chrome (placeholder, error state, toolbar, step errors). */
export interface ViewMessages {
  /** Placeholder text while the view's data is on its way. */
  loading: string
  /** Shown instead of the placeholder when the host cancelled the rendering call. */
  cancelled: string
  /** Accessible name of the refresh icon button. */
  refresh: string
  /** Accessible name of the refresh icon button while a refresh runs. */
  refreshing: string
  /** Accessible name of the fullscreen icon button (inline view). */
  enterFullscreen: string
  /** Accessible name of the fullscreen icon button (fullscreen view). */
  exitFullscreen: string
  /** Label of the button that opens the view builder. */
  build: string
  /** Shown under the placeholder once loading takes longer than `slowHintAfterMs`. */
  slowHint: string
  /** Title of the error state when the view could not be loaded. */
  errorTitle: string
  /** One line under the error title: what you can do next (a retry button follows). */
  errorHint: string
  /**
   * The line under an error title when no retry is offered (the originating
   * tool is unknown, or the view cannot refresh): what you can do instead.
   */
  errorHintNoRetry: string
  /** Retry button of the error state and of the step-error alert. */
  retry: string
  /** Summary of the error's technical-details disclosure. */
  errorDetails: string
  /** Title of the alert that lists the data steps that failed. */
  stepErrorsTitle: string
  /** The line under the step-error title when a retry is offered: what it does. */
  stepErrorsHint: string
  /** Toast title when a refresh failed: what happened, in one short sentence. */
  refreshFailed: string
  /** Toast line under {@link ViewMessages.refreshFailed}: what you see now and can do. */
  refreshFailedHint: string
  /** Toast title when the host rejected a display-mode change. */
  fullscreenFailed: string
  /** Toast line under {@link ViewMessages.fullscreenFailed}: what you can do. */
  fullscreenFailedHint: string
}

/** Strings of `ListFooter`. */
export interface ListFooterMessages {
  /** The honest count line, e.g. "Showing 8 of 42 tasks". Numbers arrive pre-formatted. */
  showing: (params: { shown: string; total: string; noun: string }) => string
  /** Plural noun used when the caller passes none. */
  defaultNoun: string
  loadMore: string
  loadingMore: string
  /** Status while a new first page is in flight over the rows on screen. */
  updating: string
  /**
   * Status at zero rows, for screen readers only (the caller's empty state is
   * what you see): a search that finds nothing is announced like any count.
   */
  noResults: string
  /** Title when a new first page failed and the previous rows stay on screen. */
  refreshFailed: string
  /** The line under {@link ListFooterMessages.refreshFailed}: what you see and can do. */
  refreshFailedHint: string
  /** Title when loading the next page failed. */
  loadMoreFailed: string
  /** The line under {@link ListFooterMessages.loadMoreFailed}: what you see and can do. */
  loadMoreFailedHint: string
}

/** Strings of `FilterBar`. */
export interface FilterBarMessages {
  /** Placeholder of the search input. */
  searchPlaceholder: string
  /** Accessible name of the search input (a placeholder is no label). */
  searchLabel: string
  /** Accessible name of the chip group. */
  chipsLabel: string
}

/** Strings of the widget renderer's fallbacks. */
export interface RendererMessages {
  /** A layout cell names a widget id the bundle does not contain. */
  widgetUnavailable: string
  /** A widget threw while rendering. */
  widgetCrashed: string
  /** Builder canvas/preview: the cell has no data yet. */
  noDataYet: string
}

/** Strings of the visual view builder (`LayoutBuilder`). */
export interface BuilderMessages {
  title: string
  builderBadge: string
  previewBadge: string
  catalogue: string
  save: string
  done: string
  viewLayoutTab: string
  viewPipelineTab: string
  viewPreviewTab: string
  saveDialogTitle: string
  saveDialogDescription: string
  saveNameLabel: string
  saveDescriptionLabel: string
  saveConfirm: string
  cancel: string
  pipelineHeader: string
  keysHeader: string
  stepsHeader: string
  keyName: string
  keyValue: string
  stepContextId: string
  stepPickerLabel: string
  addKey: string
  addStep: string
  emptyKeys: string
  emptySteps: string
  statusUpToDate: string
  statusPending: string
  statusRefreshing: string
  paletteHeader: string
  paletteEmpty: string
  canvasEmpty: string
  canvasDropHint: string
  addRow: string
  addTab: string
  removeRow: string
  renameTab: string
  removeTab: string
  tabsLabel: string
  catalogueDescription: string
  catalogueKeys: string
  catalogueSteps: string
  catalogueUnreachable: string
  catalogueUnreachableEmpty: string
  catalogueProducedBy: string
  catalogueConsumedBy: string
  catalogueNeedsKeys: string
  cataloguePickKey: string
  catalogueAddProducingStep: string
  catalogueLive: string
  catalogueMissing: string
  /** Title of the error state when the catalogue fetch fails (the raw reason goes under Details). */
  catalogueError: string
  /** What to do when the catalogue fetch fails (the state offers a retry). */
  catalogueErrorHint: string
  /** Heading for the pipeline-validation warning banner. */
  validationWarning: string
  /** Title of the save dialog's error state when a save fails (the raw reason goes under Details). */
  saveError: string
  /** What to do when a save fails (the dialog's Save button is the retry). */
  saveErrorHint: string
  /** Inline message when a tab rename is rejected (duplicate label). */
  renameDuplicate: string
  /** Toolbar stat: keys present in the live context. */
  statsLive: string
  /** Toolbar stat: widgets the current keys and steps can feed. */
  statsReachable: string
  /** Toolbar stat: widgets nothing can feed yet. */
  statsUnreachable: string
  /** Empty layout view: title. */
  emptyHintTitle: string
  /** Empty layout view: what to do. */
  emptyHintBody: string
  /** Empty layout view: button that switches to the data-sources tab. */
  openDataSources: string
  saveNamePlaceholder: string
  saveDescriptionPlaceholder: string
  /** Toast after a successful save. */
  saved: (name: string) => string
  /** Hint next to the tab strip. */
  renameHint: string
  /** Tooltip of a tab trigger. */
  renameTitle: string
  /** Note next to the data-sources header. */
  autoApplies: string
  noMoreKeys: string
  /** Tooltip of the detected value type next to a key value. */
  parsedType: string
  /** Name of a detected value type (`valueTypeLabel` code: str, num, bool, arr, obj, null). */
  valueType: (code: string) => string
  removeKey: string
  removeStep: string
  noInputs: string
  noOutputs: string
  rowLabel: (index: number) => string
  elementCount: (count: number) => string
  moveRowUp: string
  moveRowDown: string
  columnSpan: string
  configureElement: string
  configureElementSet: (count: number) => string
  removeElement: string
  resizeElement: string
  noKeysRegistered: string
  noStepsRegistered: string
  /** Prefix for "used by" lines that list steps. */
  catalogueStepPrefix: string
  /** Prefix for "used by" lines that list widgets. */
  catalogueElementPrefix: string
}

/** Strings of the builder's per-cell props sheet. */
export interface PropsSheetMessages {
  title: string
  description: string
  apply: string
  cancel: string
  reset: string
  noProps: string
  unsetOption: string
  unsupportedType: (type: string) => string
}

/** One locale's complete toolkit catalog. */
export interface ToolkitMessages {
  common: CommonMessages
  view: ViewMessages
  listFooter: ListFooterMessages
  filterBar: FilterBarMessages
  pills: { live: string }
  renderer: RendererMessages
  builder: BuilderMessages
  propsSheet: PropsSheetMessages
}
