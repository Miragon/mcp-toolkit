// The theme of the Miragon docs kit (docs/.vitepress/miragon/theme/), unchanged, plus the landing
// page (HomeLanding.vue with its stage LandingStage.vue, used by docs/index.md), the kit's layout
// with a line on the 2.x docs on the 404 page (Layout.vue) and the page styles of the kit's
// landing template (custom.css): <dl class="facts">, .diagram and .shot.
import type { Theme } from "vitepress"
import MiragonTheme from "../miragon/theme"
import HomeLanding from "./HomeLanding.vue"
import Layout from "./Layout.vue"
import "./custom.css"

export default {
  extends: MiragonTheme,
  // A .vue import has no type here: the site sits in no tsconfig.
  Layout: Layout as Theme["Layout"],
  enhanceApp({ app }) {
    app.component("HomeLanding", HomeLanding)
  },
} satisfies Theme
