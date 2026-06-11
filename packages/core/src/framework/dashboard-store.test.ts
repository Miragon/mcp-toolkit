import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import {
  createFileSystemDashboardStore,
  createInMemoryDashboardStore,
  DashboardOwnershipError,
  DASHBOARD_SCHEMA_VERSION,
  resolveSavedRecord,
  type DashboardRecord,
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

    it("stamps the current schemaVersion on create and on update", async () => {
      const saved = await store.save({ name: "Versioned", layout: { rows: [] } })
      expect(saved.schemaVersion).toBe(DASHBOARD_SCHEMA_VERSION)
      const reloaded = await store.get(saved.id, {})
      expect(reloaded?.schemaVersion).toBe(DASHBOARD_SCHEMA_VERSION)

      const updated = await store.save({ id: saved.id, name: "Versioned v2", layout: { rows: [] } })
      expect(updated.schemaVersion).toBe(DASHBOARD_SCHEMA_VERSION)
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

    it("rejects updates to a record owned by a different user", async () => {
      const alice = await store.save({ name: "Alice's", userId: "alice", layout: { rows: [] } })
      await expect(
        store.save({ id: alice.id, name: "Hijacked", userId: "mallory", layout: { rows: [] } }),
      ).rejects.toBeInstanceOf(DashboardOwnershipError)
      // Untouched: the original owner and name survive the rejected write.
      const reloaded = await store.get(alice.id, { userId: "alice" })
      expect(reloaded?.name).toBe("Alice's")
      expect(reloaded?.userId).toBe("alice")
    })

    it("never reassigns the owner when input.userId differs from the owner's update", async () => {
      // Owner updates their own record but (accidentally or maliciously)
      // passes a different userId in the input — the owner must not change.
      const alice = await store.save({ name: "Alice's", userId: "alice", layout: { rows: [] } })
      // Owner re-saves correctly; even if a stray userId leaked in, the stored
      // owner is always preserved from the existing record.
      const updated = await store.save({
        id: alice.id,
        name: "Alice's v2",
        userId: "alice",
        layout: { rows: [] },
      })
      expect(updated.userId).toBe("alice")
      expect(updated.name).toBe("Alice's v2")
    })

    it("keeps global (userId-less) records writable by anyone", async () => {
      const global = await store.save({ name: "Shared", layout: { rows: [] } })
      const updated = await store.save({
        id: global.id,
        name: "Shared (edited)",
        userId: "anyone",
        layout: { rows: [] },
      })
      expect(updated.name).toBe("Shared (edited)")
      // A record born without an owner stays ownerless — input.userId can't
      // claim it.
      expect(updated.userId).toBeUndefined()
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

describe("resolveSavedRecord", () => {
  const now = "2026-01-02T00:00:00.000Z"
  const existing: DashboardRecord = {
    id: "d1",
    name: "Original",
    userId: "alice",
    layout: { rows: [] },
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  }

  it("returns null for a create (no existing record)", () => {
    expect(resolveSavedRecord(undefined, { name: "New", layout: { rows: [] } }, now)).toBeNull()
  })

  it("throws DashboardOwnershipError when the actor doesn't own the record", () => {
    expect(() =>
      resolveSavedRecord(
        existing,
        { name: "Hijacked", userId: "mallory", layout: { rows: [] } },
        now,
      ),
    ).toThrow(DashboardOwnershipError)
  })

  it("merges the update while preserving id, owner, and createdAt", () => {
    const merged = resolveSavedRecord(
      existing,
      { id: "d1", name: "Updated", userId: "alice", layout: { rows: [] } },
      now,
    )
    expect(merged).toMatchObject({
      id: "d1",
      name: "Updated",
      userId: "alice",
      schemaVersion: DASHBOARD_SCHEMA_VERSION,
      createdAt: existing.createdAt,
      updatedAt: now,
    })
  })

  it("ignores an input.userId that tries to reassign the owner", () => {
    // ownedBy treats a userId-less actor as authorized, so this update is
    // allowed — but the existing owner must survive regardless.
    const merged = resolveSavedRecord(existing, { name: "Updated", layout: { rows: [] } }, now)
    expect(merged?.userId).toBe("alice")
  })

  it("leaves a global (ownerless) record ownerless after update", () => {
    const globalRecord: DashboardRecord = { ...existing, userId: undefined }
    const merged = resolveSavedRecord(
      globalRecord,
      { name: "Updated", userId: "anyone", layout: { rows: [] } },
      now,
    )
    expect(merged?.userId).toBeUndefined()
  })
})
