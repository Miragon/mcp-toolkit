import { McpToolkitApp } from "@miragon/mcp-toolkit-ui/app"
import { widgets } from "../../widgets.js"
import "../../styles.css"

/**
 * The toolkit composer as a plain mcp-use view. The CLI discovers this file
 * by convention (`views/render-view/` matches the `view.name` bound by
 * `installToolkit`'s render-view tool), builds it with its own Vite, and
 * mounts the default export via `bootstrapView`.
 */
export default function RenderView() {
  return <McpToolkitApp widgets={widgets} />
}
