import { createRoot } from "react-dom/client"
import { McpAppView } from "@miragon/mcp-toolkit-ui/app"
import { GreetingCard } from "../modules/hello-full/widgets/GreetingCard.js"
import { ItemCard } from "../modules/items-ui/widgets/ItemCard.js"
import "./main.css"

const widgets = {
  "hello:greeting-card": GreetingCard,
  "items-ui:item-card": ItemCard,
}

const root = document.getElementById("root")
if (!root) throw new Error("missing #root")
createRoot(root).render(<McpAppView widgets={widgets} />)
