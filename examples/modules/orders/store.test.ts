import { describe, expect, it } from "vitest"
import {
  createOrderStore,
  filterByCustomer,
  summariseOrders,
  type Customer,
  type Order,
} from "./store.js"

/**
 * Unit tests for the `orders` store's *pure* logic (the repo test policy:
 * parsers, tallies, filters — not React or tool glue). `summariseOrders` and
 * `filterByCustomer` are the building blocks both the two-step pipeline and the
 * eager dashboard rely on, so a silent drift here would corrupt every view.
 */

const CUSTOMER: Customer = { id: "c-1", name: "Acme", tier: "premium" }

const ORDERS: Order[] = [
  {
    id: "o-1",
    customerId: "c-1",
    summary: "First",
    status: "paid",
    amountCents: 1000,
    placedAt: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "o-2",
    customerId: "c-1",
    summary: "Second",
    status: "open",
    amountCents: 2000,
    placedAt: "2026-03-01T00:00:00.000Z",
  },
  {
    id: "o-3",
    customerId: "c-1",
    summary: "Refunded",
    status: "cancelled",
    amountCents: 500,
    placedAt: "2026-02-01T00:00:00.000Z",
  },
  {
    id: "o-9",
    customerId: "c-2",
    summary: "Other customer",
    status: "paid",
    amountCents: 9999,
    placedAt: "2026-04-01T00:00:00.000Z",
  },
]

describe("filterByCustomer", () => {
  it("keeps only the customer's orders, newest first", () => {
    const result = filterByCustomer(ORDERS, "c-1")
    expect(result.map((o) => o.id)).toEqual(["o-2", "o-3", "o-1"])
  })

  it("returns an empty list for a customer with no orders", () => {
    expect(filterByCustomer(ORDERS, "c-404")).toEqual([])
  })
})

describe("summariseOrders", () => {
  it("tallies by status and sums revenue excluding cancelled orders", () => {
    const kpi = summariseOrders(CUSTOMER, filterByCustomer(ORDERS, "c-1"))
    expect(kpi.counts).toEqual({ total: 3, open: 1, paid: 1, shipped: 0, cancelled: 1 })
    // 1000 (paid) + 2000 (open); the 500 cancelled order is excluded.
    expect(kpi.revenueCents).toBe(3000)
    expect(kpi.customer).toBe(CUSTOMER)
  })
})

describe("createOrderStore", () => {
  it("throws on an unknown customer id (drives the step error path)", () => {
    const store = createOrderStore({ customers: [CUSTOMER], orders: ORDERS })
    expect(() => store.getCustomer("nope")).toThrow(/Unknown customer id/)
  })

  it("kpi() and table() agree on the same customer's order set", () => {
    const store = createOrderStore({ customers: [CUSTOMER], orders: ORDERS })
    const kpi = store.kpi("c-1")
    const table = store.table("c-1")
    expect(kpi.counts.total).toBe(table.orders.length)
    expect(table.customer).toEqual(CUSTOMER)
  })

  it("isolates seeds between store instances", () => {
    const a = createOrderStore({ customers: [CUSTOMER], orders: ORDERS })
    const b = createOrderStore({ customers: [CUSTOMER], orders: ORDERS })
    // Mutating one store's returned object must not affect the other.
    a.customers()[0]!.name = "MUTATED"
    expect(b.customers()[0]!.name).toBe("Acme")
  })
})
