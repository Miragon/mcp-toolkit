import { useLocale } from "@miragon/mcp-toolkit-ui"
import type { Order } from "./order.js"

/**
 * The order card's UI text: one typed catalog per language, English and
 * German (with du), the same pattern as the example modules. The host (here:
 * the page's language switch) sets the locale through a `LocaleProvider`;
 * the card reads it with {@link useOrderCardText}.
 */
export interface OrderCardText {
  status: Record<Order["status"], string>
  loading: string
  refresh: string
  loadFailed: string
  loadFailedHint: string
  total: string
  items: string
  delivery: string
  track: string
  /** The chat hand-off says that it goes to the agent. */
  ask: string
  /** The follow-up the hand-off posts to the chat, in the user's language. */
  askPrompt: (order: Order, status: string, eta: string) => string
}

const en: OrderCardText = {
  status: {
    processing: "Processing",
    shipped: "Shipped",
    delivered: "Delivered",
    cancelled: "Cancelled",
  },
  loading: "Loading order…",
  refresh: "Refresh order",
  loadFailed: "The order couldn't be loaded",
  loadFailedHint: "Check the order number, then try again.",
  total: "Total",
  items: "Items",
  delivery: "Delivery",
  track: "Track shipment",
  ask: "Ask the agent",
  askPrompt: (order, status, eta) =>
    `Order ${order.id} for ${order.customer} is "${status}", delivery expected ${eta}. ` +
    "Is it running late, and what should I tell the customer? (use get_order)",
}

const de: OrderCardText = {
  status: {
    processing: "In Bearbeitung",
    shipped: "Versendet",
    delivered: "Zugestellt",
    cancelled: "Storniert",
  },
  loading: "Bestellung wird geladen…",
  refresh: "Bestellung aktualisieren",
  loadFailed: "Die Bestellung konnte nicht geladen werden",
  loadFailedHint: "Prüf die Bestellnummer und versuch es dann noch einmal.",
  total: "Summe",
  items: "Artikel",
  delivery: "Lieferung",
  track: "Sendung verfolgen",
  ask: "Agent fragen",
  askPrompt: (order, status, eta) =>
    `Bestellung ${order.id} für ${order.customer} ist „${status}“, Lieferung voraussichtlich ` +
    `${eta}. Ist sie verspätet, und was sage ich dem Kunden? (nutze get_order)`,
}

/** Both catalogs, keyed by language. Exported for the copy-rule test. */
export const ORDER_CARD_TEXT: Readonly<Record<"en" | "de", OrderCardText>> = { en, de }

/** The catalog for a locale tag (`de-AT` → German); English for any other language. */
export function orderCardText(locale: string): OrderCardText {
  return locale.trim().toLowerCase().split(/[-_]/)[0] === "de" ? de : en
}

/** The order card's text in the active locale (the nearest `LocaleProvider`). */
export function useOrderCardText(): OrderCardText {
  return orderCardText(useLocale())
}
