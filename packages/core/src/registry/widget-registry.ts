import type { WidgetDefinition } from "../types/widget.js"

export class WidgetRegistry {
  private widgets = new Map<string, WidgetDefinition>()

  register(widget: WidgetDefinition): void {
    if (this.widgets.has(widget.id)) {
      throw new Error(`Widget ID collision: "${widget.id}" is already registered`)
    }
    this.widgets.set(widget.id, widget)
  }

  get(widgetId: string): WidgetDefinition | undefined {
    return this.widgets.get(widgetId)
  }

  /**
   * Remove a previously-registered widget. Used to roll back a partially
   * loaded module when isolating a collision (see `loadApps`); a
   * no-op for unknown ids.
   */
  unregister(widgetId: string): void {
    this.widgets.delete(widgetId)
  }

  findByRequiredKeys(availableKeys: string[]): WidgetDefinition[] {
    const keySet = new Set(availableKeys)
    return [...this.widgets.values()].filter((w) => w.requires.every((key) => keySet.has(key)))
  }

  getAll(): WidgetDefinition[] {
    return [...this.widgets.values()]
  }
}
