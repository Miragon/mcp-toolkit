import { useHostContext } from "mcp-use/react"
import { LocaleProvider } from "@miragon/mcp-toolkit-ui"
import { McpToolkitApp } from "@miragon/mcp-toolkit-ui/app"
import { widgets } from "../shared/widgets.js"
import "../shared/styles.css"

/**
 * The toolkit composer as a plain mcp-use view. The CLI discovers this file
 * by convention (`views/render-view/` matches the `view.name` bound by
 * `installToolkit`'s render-view tool), builds it, and mounts the default
 * export via `bootstrapView`.
 */
export default function RenderView() {
  // The host's language for the widgets' own text (the toolkit chrome follows
  // it by itself); the CLI mounts this component, so the view hooks run here.
  const { locale } = useHostContext()
  return (
    <LocaleProvider locale={locale}>
      <McpToolkitApp widgets={widgets} />
    </LocaleProvider>
  )
}
