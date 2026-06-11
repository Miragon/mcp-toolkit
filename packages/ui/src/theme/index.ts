// White-label theming. Browser-safe (React + DOM only, no `mcp-use/react`), so
// it is re-exported from the root barrel — a consumer can theme the toolkit's
// primitives without pulling in the host runtime.
export { createTheme, tokensToVars, TOKEN_TO_CSS_VAR } from "./create-theme.js"
export type { ThemeTokens, ThemeDefinition, ThemeVars, CreateThemeOptions } from "./create-theme.js"
export { ThemeProvider, useTheme } from "./theme-provider.js"
export type { ThemeMode, ThemeContextValue, ThemeProviderProps } from "./theme-provider.js"
export { themePresets } from "./presets.js"
export type { ThemePresetId } from "./presets.js"
