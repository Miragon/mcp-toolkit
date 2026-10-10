// White-label theming. Browser-safe (React + DOM only, no `mcp-use/react`), so
// it is re-exported from the root barrel — a consumer can theme the toolkit's
// primitives without pulling in the host runtime.
export {
  createTheme,
  tokensToVars,
  resolveThemeVars,
  TOKEN_TO_CSS_VAR,
  ROLE_TOKENS,
  MODE_INVARIANT_VARS,
} from "./create-theme.js"
export type { ThemeTokens, ThemeDefinition, ThemeVars, CreateThemeOptions } from "./create-theme.js"
export { ThemeProvider, useTheme } from "./theme-provider.js"
export type { ThemeMode, ThemeContextValue, ThemeProviderProps } from "./theme-provider.js"
export { usePortalContainer } from "./portal-container.js"
export { themePresets } from "./presets.js"
export type { ThemePresetId } from "./presets.js"
export { CD_TOKENS, CD_TOKENS_VERSION } from "./cd-tokens.js"
export type { CdTokenName } from "./cd-tokens.js"
export { fontFaces, GEIST_FONT_FILES } from "./fonts.js"
export type { FontFacesOptions } from "./fonts.js"
