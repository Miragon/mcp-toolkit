import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import {
  createFileSystemDashboardStore,
  createInMemoryDashboardStore,
  type DashboardStore,
} from "./dashboard-store.js"

function runSharedStoreTests(
  name: string,
  factory: () => Promise<{ store: DashboardStore; cleanup: () => Promise<void> }>,
) {
  describe(name, () => {
    let store: DashboardStore
    let cleanup: () => Promise<void>

    beforeEach(async () => {
      const setup = await factory()
      store = setup.store
      cleanup = setup.cleanup
    })

    afterEach(async () => {
      await cleanup()
    })

    it("generates an id on initial save and round-trips through get/list", async () => {
      const saved = await store.save({
        name: "Sales overview",
        layout: { rows: [{ row: [{ widget: "sales:kpis" }] }] },
      })
      expect(saved.id).toBeTruthy()
      expect(saved.createdAt).toBe(saved.updatedAt)

      const loaded = await store.get(saved.id, {})
      expect(loaded?.name).toBe("Sales overview")
      expect(loaded?.layout).toEqual({ rows: [{ row: [{ widget: "sales:kpis" }] }] })

      const list = await store.list({})
      expect(list.map((i) => i.id)).toContain(saved.id)
    })

    it("updates an existing record when an id is supplied", async () => {
      const saved = await store.save({
        name: "Draft",
        layout: { rows: [] },
      })
      await new Promise((r) => setTimeout(r, 5))
      const updated = await store.save({
        id: saved.id,
        name: "Final",
        layout: { rows: [{ row: [{ widget: "x:y" }] }] },
      })
      expect(updated.id).toBe(saved.id)
      expect(updated.createdAt).toBe(saved.createdAt)
      expect(updated.updatedAt).not.toBe(saved.updatedAt)
      expect(updated.name).toBe("Final")

      const list = await store.list({})
      expect(list).toHaveLength(1)
    })

    it("scopes records to userId when set", async () => {
      await store.save({
        name: "Alice's",
        userId: "alice",
        layout: { rows: [] },
      })
      const bobRecord = await store.save({
        name: "Bob's",
        userId: "bob",
        layout: { rows: [] },
      })
      const aliceList = await store.list({ userId: "alice" })
      expect(aliceList.map((i) => i.name)).toEqual(["Alice's"])
      const bobFetch = await store.get(bobRecord.id, { userId: "alice" })
      expect(bobFetch).toBeUndefined()
    })

    it("deletes records and reports false when absent", async () => {
      const saved = await store.save({ name: "Temp", layout: { rows: [] } })
      expect(await store.delete(saved.id, {})).toBe(true)
      expect(await store.get(saved.id, {})).toBeUndefined()
      expect(await store.delete(saved.id, {})).toBe(false)
    })
  })
}

runSharedStoreTests("createInMemoryDashboardStore", () =>
  Promise.resolve({ store: createInMemoryDashboardStore(), cleanup: () => Promise.resolve() }),
)

runSharedStoreTests("createFileSystemDashboardStore", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "mcp-toolkit-dashboards-"))
  return {
    store: createFileSystemDashboardStore({ dir }),
    cleanup: () => fs.rm(dir, { recursive: true, force: true }),
  }
})
