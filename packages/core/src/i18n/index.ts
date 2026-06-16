// Localization engine. Browser-safe (pure data + functions, no `node:*`, no
// `mcp-use/*`), so it is re-exported from the core root barrel and shared by the
// server (tool summaries) and the UI (widget strings). Ships no catalogs — the
// consuming app provides its own and decides where the active locale comes from.
export { createTranslator } from "./translator.js"
export type {
  Message,
  MessageCatalog,
  Catalogs,
  Translate,
  CreateTranslatorOptions,
} from "./translator.js"
