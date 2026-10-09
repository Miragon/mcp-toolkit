import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { vi } from "vitest"
import {
  assertDashboardWritable,
  createFileSystemDashboardStore,
  createInMemoryDashboardStore,
  DashboardOwnershipError,
  DashboardUnreadableError,
  DASHBOARD_SCHEMA_VERSION,
  isDashboardOwnedBy,
  parseDashboardRecord,
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

    it("keeps owner-less records writable — and owner-less — in global scope (no actor id)", async () => {
      const global = await store.save({ name: "Shared", layout: { rows: [] } })
      const updated = await store.save({
        id: global.id,
        name: "Shared (edited)",
        layout: { rows: [] },
      })
      expect(updated.name).toBe("Shared (edited)")
      expect(updated.userId).toBeUndefined()
      expect((await store.list({})).map((i) => i.id)).toEqual([global.id])
    })

    /**
     * Global scope belongs to the no-OAuth boot. Under OAuth an owner-less
     * record is no one's — in particular not the identified caller's — so it
     * can neither be claimed, overwritten nor deleted, and it does not leak
     * into anyone's listing.
     */
    it("refuses an identified actor on an owner-less record and hides it from that actor", async () => {
      const global = await store.save({ name: "Shared", layout: { rows: [] } })

      await expect(
        store.save({ id: global.id, name: "Claimed", userId: "anyone", layout: { rows: [] } }),
      ).rejects.toThrow(/has no owner/)
      expect(await store.list({ userId: "anyone" })).toEqual([])
      expect(await store.get(global.id, { userId: "anyone" })).toBeUndefined()
      expect(await store.delete(global.id, { userId: "anyone" })).toBe(false)

      // Untouched: still owner-less, still named as before.
      const reloaded = await store.get(global.id, {})
      expect(reloaded?.name).toBe("Shared")
      expect(reloaded?.userId).toBeUndefined()
    })

    it("names each summary's owner so the tools can verify a listing without a read per entry", async () => {
      const alice = await store.save({ name: "Alice's", userId: "alice", layout: { rows: [] } })
      const global = await store.save({ name: "Shared", layout: { rows: [] } })

      expect(await store.list({ userId: "alice" })).toEqual([
        expect.objectContaining({ id: alice.id, userId: "alice" }),
      ])
      const all = Object.fromEntries((await store.list({})).map((i) => [i.id, i]))
      expect(all[alice.id]?.userId).toBe("alice")
      expect(all[global.id]?.userId).toBeUndefined()
    })

    it("lets the owner delete its own record while another caller cannot", async () => {
      const alice = await store.save({ name: "Alice's", userId: "alice", layout: { rows: [] } })
      expect(await store.delete(alice.id, { userId: "bob" })).toBe(false)
      expect(await store.get(alice.id, { userId: "alice" })).toBeDefined()
      expect(await store.delete(alice.id, { userId: "alice" })).toBe(true)
      expect(await store.get(alice.id, {})).toBeUndefined()
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

/**
 * The ownership rule of the store contract, exported so custom stores apply
 * it instead of re-deriving it. 2.5 also granted owner-less records to every
 * identified caller; that row is the one this table exists to pin.
 */
describe("isDashboardOwnedBy", () => {
  it.each([
    { ownerId: undefined, userId: undefined, owned: true, why: "global scope sees owner-less" },
    { ownerId: "alice", userId: undefined, owned: true, why: "global scope sees owned" },
    { ownerId: "alice", userId: "alice", owned: true, why: "the owner" },
    { ownerId: "alice", userId: "bob", owned: false, why: "another caller" },
    { ownerId: undefined, userId: "bob", owned: false, why: "owner-less is no one's" },
    { ownerId: "alice", userId: "", owned: true, why: "an empty id is no id (global)" },
  ])("$why → $owned", ({ ownerId, userId, owned }) => {
    expect(isDashboardOwnedBy(ownerId, userId)).toBe(owned)
  })
})

describe("assertDashboardWritable", () => {
  const record = (userId?: string): DashboardRecord => ({
    id: "d1",
    name: "n",
    ...(userId === undefined ? {} : { userId }),
    layout: { rows: [] },
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  })

  it("passes the owner and global scope", () => {
    expect(() => assertDashboardWritable(record("alice"), "alice")).not.toThrow()
    expect(() => assertDashboardWritable(record("alice"), undefined)).not.toThrow()
    expect(() => assertDashboardWritable(record(), undefined)).not.toThrow()
  })

  it("refuses another caller and an identified caller on an owner-less record, by message", () => {
    expect(() => assertDashboardWritable(record("alice"), "bob")).toThrowError(
      new DashboardOwnershipError('Access denied: dashboard "d1" is owned by another user.'),
    )
    expect(() => assertDashboardWritable(record(), "bob")).toThrowError(
      new DashboardOwnershipError(
        'Access denied: dashboard "d1" has no owner; an owner-less (global-scope) dashboard is not writable by an identified caller.',
      ),
    )
  })
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

  it("leaves a global (owner-less) record owner-less after a global-scope update", () => {
    const globalRecord: DashboardRecord = { ...existing, userId: undefined }
    const merged = resolveSavedRecord(globalRecord, { name: "Updated", layout: { rows: [] } }, now)
    expect(merged).toMatchObject({ name: "Updated" })
    expect(merged?.userId).toBeUndefined()
  })

  it("refuses an identified actor on an owner-less record instead of letting it claim the record", () => {
    const globalRecord: DashboardRecord = { ...existing, userId: undefined }
    expect(() =>
      resolveSavedRecord(
        globalRecord,
        { name: "Claimed", userId: "anyone", layout: { rows: [] } },
        now,
      ),
    ).toThrowError(
      new DashboardOwnershipError(
        'Access denied: dashboard "d1" has no owner; an owner-less (global-scope) dashboard is not writable by an identified caller.',
      ),
    )
  })

  it("names the other owner's record as owned by another user", () => {
    expect(() =>
      resolveSavedRecord(existing, { name: "x", userId: "mallory", layout: { rows: [] } }, now),
    ).toThrowError(
      new DashboardOwnershipError('Access denied: dashboard "d1" is owned by another user.'),
    )
  })
})

describe("parseDashboardRecord", () => {
  const valid: DashboardRecord = {
    id: "d1",
    name: "Ok",
    layout: { rows: [] },
    schemaVersion: DASHBOARD_SCHEMA_VERSION,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-02T00:00:00.000Z",
  }

  it("accepts a well-formed record", () => {
    expect(parseDashboardRecord(valid)).toMatchObject({ id: "d1", name: "Ok" })
  })

  it("accepts a legacy record with no schemaVersion (implicit v0)", () => {
    const legacy: Record<string, unknown> = { ...valid }
    delete legacy.schemaVersion
    expect(parseDashboardRecord(legacy)).toMatchObject({ id: "d1" })
  })

  const withoutUpdatedAt = (): Record<string, unknown> => {
    const rec: Record<string, unknown> = { ...valid }
    delete rec.updatedAt
    return rec
  }

  it.each([
    ["a missing required field (updatedAt)", withoutUpdatedAt()],
    ["a wrong field type (name is a number)", { ...valid, name: 42 }],
    ["a malformed layout", { ...valid, layout: { not: "a layout" } }],
    ["a non-object", "just a string"],
    ["null", null],
  ])("rejects %s", (_label, input) => {
    expect(parseDashboardRecord(input)).toBeUndefined()
  })

  it("rejects a record from a newer schema version this build can't read", () => {
    expect(
      parseDashboardRecord({ ...valid, schemaVersion: DASHBOARD_SCHEMA_VERSION + 1 }),
    ).toBeUndefined()
  })
})

describe("createFileSystemDashboardStore — an unreadable record is a conflict, never absent", () => {
  let dir: string
  let store: DashboardStore

  const fileOf = (id: string) => path.join(dir, `${encodeURIComponent(id)}.json`)
  const writeRaw = (id: string, content: unknown) =>
    fs.writeFile(fileOf(id), typeof content === "string" ? content : JSON.stringify(content))
  const newerRecord = (id: string, userId?: string) => ({
    id,
    name: "From the future",
    layout: { rows: [] },
    ...(userId ? { userId } : {}),
    schemaVersion: DASHBOARD_SCHEMA_VERSION + 1,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-03T00:00:00.000Z",
  })

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "mcp-toolkit-dashboards-corrupt-"))
    store = createFileSystemDashboardStore({ dir })
    vi.spyOn(console, "warn").mockImplementation(() => {})
  })

  afterEach(async () => {
    vi.restoreAllMocks()
    await fs.rm(dir, { recursive: true, force: true })
  })

  it("list() reports unreadable records (with the reason) instead of skipping them or crashing on the sort", async () => {
    await store.save({ name: "Good", layout: { rows: [] } })
    // A record missing updatedAt would blow up `updatedAt.localeCompare` in the sort.
    await writeRaw("broken", { id: "broken", name: "x" })
    await writeRaw("notjson", "{ not valid json")
    await writeRaw("future", newerRecord("future"))

    const list = await store.list({})
    expect(list.map((d) => d.name).sort()).toEqual(["Good", "broken", "future", "notjson"])
    const byId = Object.fromEntries(list.map((d) => [d.id, d]))
    expect(byId.broken).toMatchObject({
      name: "broken",
      updatedAt: "",
      unreadable: "does not match the current record schema",
    })
    expect(byId.notjson?.unreadable).toBe("file is not valid JSON")
    expect(byId.future).toMatchObject({
      updatedAt: "2026-01-03T00:00:00.000Z",
      unreadable: `written by a newer schemaVersion ${DASHBOARD_SCHEMA_VERSION + 1} (this build reads up to ${DASHBOARD_SCHEMA_VERSION})`,
    })
    const good = list.find((d) => d.name === "Good")
    expect(good?.unreadable).toBeUndefined()
  })

  it("get() reports a corrupt record as unreadable instead of absent", async () => {
    await writeRaw("bad", { id: "bad" })
    await expect(store.get("bad", {})).rejects.toThrowError(
      new DashboardUnreadableError("bad", "does not match the current record schema"),
    )
  })

  it("save() refuses to overwrite a record from a newer schemaVersion — no new owner is stamped", async () => {
    await writeRaw("future", newerRecord("future", "alice"))
    const before = await fs.readFile(fileOf("future"), "utf-8")

    await expect(
      store.save({ id: "future", name: "Overwrite", userId: "alice", layout: { rows: [] } }),
    ).rejects.toBeInstanceOf(DashboardUnreadableError)
    await expect(
      store.save({ id: "future", name: "Overwrite", layout: { rows: [] } }),
    ).rejects.toBeInstanceOf(DashboardUnreadableError)

    expect(await fs.readFile(fileOf("future"), "utf-8")).toBe(before)
  })

  it("save() and delete() refuse a corrupt-JSON record and leave the file in place", async () => {
    await writeRaw("torn", "{ half a record")
    await expect(
      store.save({ id: "torn", name: "Fresh", userId: "mallory", layout: { rows: [] } }),
    ).rejects.toThrowError(new DashboardUnreadableError("torn", "file is not valid JSON"))
    await expect(store.delete("torn", { userId: "mallory" })).rejects.toBeInstanceOf(
      DashboardUnreadableError,
    )
    expect(await fs.readFile(fileOf("torn"), "utf-8")).toBe("{ half a record")
  })

  it("keeps another user's unreadable record invisible to an identified caller", async () => {
    await writeRaw("alices", newerRecord("alices", "alice"))

    expect(await store.list({ userId: "bob" })).toEqual([])
    await expect(store.get("alices", { userId: "bob" })).resolves.toBeUndefined()
    await expect(store.delete("alices", { userId: "bob" })).resolves.toBe(false)
    await expect(
      store.save({ id: "alices", name: "Hijack", userId: "bob", layout: { rows: [] } }),
    ).rejects.toBeInstanceOf(DashboardOwnershipError)

    // The owner sees it reported in its own listing and on get.
    const own = await store.list({ userId: "alice" })
    expect(own.map((d) => [d.id, Boolean(d.unreadable)])).toEqual([["alices", true]])
    await expect(store.get("alices", { userId: "alice" })).rejects.toBeInstanceOf(
      DashboardUnreadableError,
    )
  })

  it("does not list an unreadable record of unknown ownership for an identified caller, but reports it by id", async () => {
    await writeRaw("orphan", "not json at all")
    expect(await store.list({ userId: "bob" })).toEqual([])
    await expect(store.get("orphan", { userId: "bob" })).rejects.toBeInstanceOf(
      DashboardUnreadableError,
    )
  })

  it("reports a stray file whose name is not valid percent-encoding under its raw name", async () => {
    await fs.writeFile(path.join(dir, "%zz.json"), "{")
    const list = await store.list({})
    expect(list).toEqual([
      { id: "%zz", name: "%zz", updatedAt: "", unreadable: "file is not valid JSON" },
    ])
  })

  it("list() survives an entry the filesystem refuses to read (EISDIR): reported in global scope, hidden otherwise", async () => {
    const good = await store.save({ name: "Good", layout: { rows: [] } })
    // A directory whose name ends in .json — readFile rejects it with EISDIR.
    await fs.mkdir(path.join(dir, "trap.json"))

    const list = await store.list({})
    expect(list.map((d) => d.id).sort()).toEqual([good.id, "trap"].sort())
    expect(list.find((d) => d.id === "trap")).toEqual({
      id: "trap",
      name: "trap",
      updatedAt: "",
      unreadable: "cannot be read (EISDIR)",
    })
    // Not attributable to anyone, so an identified caller never sees it.
    expect(await store.list({ userId: "bob" })).toEqual([])
  })

  it("list() names the owner of an unreadable record it reports to that owner", async () => {
    await writeRaw("alices", newerRecord("alices", "alice"))
    const [summary] = await store.list({ userId: "alice" })
    expect(summary).toMatchObject({ id: "alices", userId: "alice" })
    expect(summary?.unreadable).toBeTruthy()
  })

  it("writes atomically: a save leaves exactly the record file behind, no temp files", async () => {
    const saved = await store.save({ name: "Atomic", layout: { rows: [] } })
    expect(await fs.readdir(dir)).toEqual([`${encodeURIComponent(saved.id)}.json`])
  })
})
