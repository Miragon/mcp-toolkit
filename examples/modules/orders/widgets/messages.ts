import { useLocale } from "@miragon/mcp-toolkit-ui"
import type { Customer, OrderStatus } from "../store.js"

/**
 * The orders dashboard's UI text: one typed catalog per language, English
 * and German (with du), the same pattern as the toolkit's own catalog and
 * the tasks module (`../../tasks/widgets/messages.ts`). The app sets the
 * locale from the host (a `LocaleProvider`); the widgets read it with
 * {@link useOrdersText} and format money, dates and counts in that locale
 * ({@link formatEuro}, {@link formatDay}).
 */
export interface OrdersText {
  tier: Record<Customer["tier"], string>
  /** "4 orders"; `formatted` is the count in the widget's locale. */
  orderCount: (count: number, formatted: string) => string
  /** Header of the strip with the counts by status (the table below is titled "Orders"). */
  kpiHeader: string
  revenue: string
  status: Record<OrderStatus, string>
  tableTitle: string
  inTotal: (formatted: string) => string
  columns: { order: string; placed: string; status: string; amount: string }
  emptyTitle: string
  emptyHint: string
}

const en: OrdersText = {
  tier: { standard: "Standard customer", premium: "Premium customer" },
  orderCount: (count, formatted) => `${formatted} ${count === 1 ? "order" : "orders"}`,
  kpiHeader: "By status",
  revenue: "Revenue",
  status: { open: "Open", paid: "Paid", shipped: "Shipped", cancelled: "Cancelled" },
  tableTitle: "Orders",
  inTotal: (formatted) => `${formatted} in total`,
  columns: { order: "Order", placed: "Placed", status: "Status", amount: "Amount" },
  emptyTitle: "No orders yet",
  emptyHint: "Orders this customer places show up here.",
}

const de: OrdersText = {
  tier: { standard: "Standardkunde", premium: "Premiumkunde" },
  orderCount: (count, formatted) => `${formatted} ${count === 1 ? "Bestellung" : "Bestellungen"}`,
  kpiHeader: "Nach Status",
  revenue: "Umsatz",
  status: { open: "Offen", paid: "Bezahlt", shipped: "Versendet", cancelled: "Storniert" },
  tableTitle: "Bestellungen",
  inTotal: (formatted) => `${formatted} insgesamt`,
  columns: { order: "Bestellung", placed: "Bestellt am", status: "Status", amount: "Betrag" },
  emptyTitle: "Noch keine Bestellungen",
  emptyHint: "Bestellungen dieses Kunden erscheinen hier.",
}

/** Both catalogs, keyed by language. Exported for the copy-rule test. */
export const ORDERS_TEXT: Readonly<Record<"en" | "de", OrdersText>> = { en, de }

/** The catalog for a locale tag (`de-AT` → German); English for any other language. */
export function ordersText(locale: string): OrdersText {
  return locale.trim().toLowerCase().split(/[-_]/)[0] === "de" ? de : en
}

/** The orders text in the active locale (the nearest `LocaleProvider`). */
export function useOrdersText(): OrdersText {
  return ordersText(useLocale())
}

/** Cents → a euro amount in `locale` (the store keeps minor units); English for an invalid tag. */
export function formatEuro(cents: number, locale: string): string {
  const options = { style: "currency", currency: "EUR" } as const
  try {
    return new Intl.NumberFormat(locale, options).format(cents / 100)
  } catch {
    return new Intl.NumberFormat("en", options).format(cents / 100)
  }
}

/** An ISO timestamp as a medium date in `locale` ("Jun 3, 2026", "03.06.2026"); verbatim if unparsable. */
export function formatDay(iso: string, locale: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  try {
    return new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(date)
  } catch {
    return iso
  }
}
