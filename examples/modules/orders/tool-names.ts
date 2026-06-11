/**
 * Tool-name constants for the `orders` module.
 *
 * Centralised because the names are referenced from both sides that must agree:
 * the server registers them (`plugin.ts`) and the widgets / smoke test name them
 * back. Pure string constants → safe to import into the browser widget bundle.
 */

/** Read view: composes the multi-widget dashboard (the eager `show_*` entry point). */
export const SHOW_ORDERS_DASHBOARD = "show_orders_dashboard"

/** App-only JSON feed (no UI) the dashboard widgets self-fetch on refresh. */
export const ORDERS_DASHBOARD_DATA = "orders_dashboard_data"

/** Lists the customers the dashboard / pipeline can be scoped to. */
export const LIST_CUSTOMERS = "list_customers"
