import { useHostContext } from "mcp-use/react"
import { LocaleProvider } from "@miragon/mcp-toolkit-ui"
import { McpToolkitApp } from "@miragon/mcp-toolkit-ui/app"
import { widgets } from "../shared/widgets.js"
import "../shared/styles.css"

/**
 * The tasks module's widget tool renders through the same shell as
 * `render-view`: one view directory per view-bound tool (CLI convention),
 * all mounting the shared widget map. The tool's `buildSingleWidgetView`
 * envelope tells the shell which widget to show.
 */
export default function ShowTasksBoard() {
  // The host's language for the widgets' own text (the toolkit chrome follows
  // it by itself); the CLI mounts this component, so the view hooks run here.
  const { locale } = useHostContext()
  return (
    <LocaleProvider locale={locale}>
      <McpToolkitApp widgets={widgets} />
    </LocaleProvider>
  )
}
