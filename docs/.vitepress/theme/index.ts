// The theme of the Miragon docs kit (docs/.vitepress/miragon/theme/), unchanged, plus the landing
// page (HomeLanding.vue with its stage LandingStage.vue, used by docs/index.md) and the page
// styles of the kit's landing template (custom.css): <dl class="facts">, .diagram and .shot.
import type { Theme } from "vitepress"
import MiragonTheme from "../miragon/theme"
import HomeLanding from "./HomeLanding.vue"
import "./custom.css"

export default {
  extends: MiragonTheme,
  enhanceApp({ app }) {
    app.component("HomeLanding", HomeLanding)
  },
} satisfies Theme
