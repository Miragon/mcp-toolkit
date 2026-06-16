// Localization context. Browser-safe (React only, no `mcp-use/react`), so it is
// re-exported from the root barrel — a consumer wraps its widget tree in
// <LocaleProvider> and reads the active locale with useLocale/useTranslate,
// without pulling in the host runtime. Pairs with `createTranslator` from
// `@miragon/mcp-toolkit-core`.
export { LocaleProvider, useLocale, useTranslate } from "./locale-provider.js"
export type { LocaleContextValue, LocaleProviderProps, BoundTranslate } from "./locale-provider.js"
