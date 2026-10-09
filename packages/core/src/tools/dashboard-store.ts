import fs from "node:fs/promises"
import path from "node:path"
import { randomUUID } from "node:crypto"
import { z } from "zod"
import type { PipelineStepRef } from "../types/pipeline.js"
import type { LayoutConfig } from "../framework/layout-types.js"
import { layoutSchema } from "../framework/layout-schemas.js"

/**
 * Current on-disk schema version stamped onto every saved record. Bump this
 * whenever the persisted shape changes in a way a loader would need to
 * migrate. Records persisted before versioning carry no `schemaVersion`
 * (treated as the implicit version 0).
 */
export const DASHBOARD_SCHEMA_VERSION = 1

/**
 * Persisted dashboard = full `render-view` input plus identity and
 * ownership metadata. The server generates `id`, `createdAt`, `updatedAt`;
 * `userId` is the caller id `resolveCallerId(ctx)` resolves on save.
 */
export interface DashboardRecord {
  id: string
  name: string
  description?: string
  /**
   * Owner; omitted only when the host boots without OAuth (global scope). An
   * owner-less record is invisible to — and never writable by — an
   * identified caller.
   */
  userId?: string
  keys?: Record<string, unknown>
  steps?: PipelineStepRef[]
  layout: LayoutConfig
  title?: string
  /**
   * On-disk schema version, set to {@link DASHBOARD_SCHEMA_VERSION} on every
   * save. Optional so records written before versioning still type-check;
   * loaders treat its absence as version 0.
   */
  schemaVersion?: number
  createdAt: string
  updatedAt: string
}

export interface DashboardSaveInput {
  id?: string
  name: string
  description?: string
  userId?: string
  keys?: Record<string, unknown>
  steps?: PipelineStepRef[]
  layout: LayoutConfig
  title?: string
}

export interface DashboardListFilter {
  userId?: string
}

/** Summary view returned by `list` — full layout body deliberately omitted. */
export interface DashboardSummary {
  id: string
  name: string
  description?: string
  title?: string
  updatedAt: string
  /**
   * The record's owner, as in {@link DashboardRecord.userId}. The built-in
   * stores report it, and a custom store should: the dashboard tools hold an
   * identified caller to its own summaries with it. A summary without one is
   * verified through `get` instead (one read per entry).
   */
  userId?: string
  /**
   * Set (to the reason) when the record exists but this build cannot read it
   * — a newer `schemaVersion`, corrupt JSON, a failed schema check, or (in a
   * listing) an entry the filesystem refuses to read. `name` then repeats the
   * id and `updatedAt` is best-effort (empty when unknown).
   * Reported instead of skipped so it can't silently vanish, and refused by
   * `get` / `save` / `delete` with {@link DashboardUnreadableError}.
   */
  unreadable?: string
}

/**
 * Persistence backing for dashboards. The framework is indifferent to how
 * records are stored — consumers inject whichever implementation fits
 * their deployment (in-memory for tests, filesystem for local dev, a DB-
 * backed one for production).
 *
 * All methods accept an optional `userId` filter so implementations can
 * enforce ownership:
 *
 * - **No `userId`** — global scope, the no-OAuth boot: every record is
 *   visible and writable.
 * - **A `userId`** — the caller sees and touches only records whose
 *   `userId` equals it. An owner-less record is NOT the caller's: it stays
 *   invisible to `list`/`get`/`delete`, and `save` refuses to update it.
 *   (The dashboard tools never reach a store without a `userId` once the
 *   request is authenticated — they refuse the call instead.)
 *
 * {@link isDashboardOwnedBy} is that rule; a custom store should apply it
 * rather than re-derive it, and report each summary's owner
 * ({@link DashboardSummary.userId}). The dashboard tools re-check every
 * answer for an identified caller anyway — `get`, `list`, and the record a
 * `save` or `delete` would touch — so a store on the laxer 2.5 rule (an
 * owner-less record counted as everyone's) cannot leak or hand out such a
 * record; it only costs extra reads.
 *
 * `save` carries the acting user as `input.userId`: updating an existing
 * record the caller doesn't own is rejected with
 * {@link DashboardOwnershipError}, and `input.userId` can never reassign an
 * existing record's owner.
 *
 * A record that exists but cannot be read (newer `schemaVersion`, corrupt
 * JSON, failed schema) is a conflict, never "absent": `get`, `save` and
 * `delete` reject with {@link DashboardUnreadableError}, and `list` reports it
 * with {@link DashboardSummary.unreadable} — so a save can never overwrite it
 * and hand it a new owner.
 */
export interface DashboardStore {
  save(input: DashboardSaveInput): Promise<DashboardRecord>
  list(filter: DashboardListFilter): Promise<DashboardSummary[]>
  get(id: string, filter: DashboardListFilter): Promise<DashboardRecord | undefined>
  delete(id: string, filter: DashboardListFilter): Promise<boolean>
}

const stepRefSchema = z.object({
  id: z.string(),
  step: z.string(),
  optional: z.boolean().optional(),
})

/**
 * Runtime shape of a persisted dashboard. Kept in sync with
 * {@link DashboardRecord}; `layout` reuses {@link layoutSchema} so a stored
 * record and a fresh `render-view` layout validate against the same contract.
 */
const dashboardRecordSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().optional(),
  userId: z.string().optional(),
  keys: z.record(z.string(), z.unknown()).optional(),
  steps: z.array(stepRefSchema).optional(),
  layout: layoutSchema,
  title: z.string().optional(),
  schemaVersion: z.number().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
})

/**
 * Validate a value read back from persistence into a {@link DashboardRecord},
 * or `undefined` when it isn't one this version can safely use.
 *
 * Untrusted disk state is otherwise cast straight to `DashboardRecord`, so a
 * corrupt or partial file (e.g. a missing `updatedAt`) slips through and later
 * crashes `list` (its `updatedAt.localeCompare` sort) or feeds garbage into
 * `render-view`. This is the single fail-soft gate: a record that fails the
 * schema — or carries a `schemaVersion` newer than this build understands — is
 * rejected here so callers skip it instead of trusting it.
 *
 * Exported for unit testing.
 */
export function parseDashboardRecord(raw: unknown): DashboardRecord | undefined {
  const result = dashboardRecordSchema.safeParse(raw)
  if (!result.success) return undefined
  // A record written by a newer build may use fields/semantics this version
  // can't honour — refuse it rather than silently mis-reading it.
  if ((result.data.schemaVersion ?? 0) > DASHBOARD_SCHEMA_VERSION) return undefined
  return result.data
}

function nowIso(): string {
  return new Date().toISOString()
}

/**
 * The ownership rule of the {@link DashboardStore} contract, shared by every
 * built-in store and by the dashboard tools: no caller id = global scope
 * (no-OAuth boot, everything visible); an identified caller owns exactly the
 * records stamped with its id — an owner-less record is not one of them.
 *
 * Exported so a custom store applies the same rule instead of re-deriving it
 * (the 2.5 rule also granted owner-less records to every identified caller).
 */
export function isDashboardOwnedBy(
  ownerId: string | undefined,
  userId: string | undefined,
): boolean {
  if (!userId) return true
  return ownerId === userId
}

/**
 * Error thrown by `save()` when an update would touch a record the caller
 * doesn't own, or would change a record's owner. Distinct from the
 * fail-soft "not found" of `get`/`delete` (which return `undefined`/`false`)
 * because `save` has no nullable return — a write that violates ownership is
 * an explicit denial, not a silent no-op.
 */
export class DashboardOwnershipError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "DashboardOwnershipError"
  }
}

/**
 * Error thrown by `get`, `save` and `delete` when the addressed record exists
 * but this build cannot read it (newer `schemaVersion`, corrupt JSON, failed
 * schema). Treating such a record as absent would let `save` overwrite it —
 * stamping a fresh owner onto someone else's data — so it is a conflict the
 * caller has to see.
 */
export class DashboardUnreadableError extends Error {
  constructor(
    readonly dashboardId: string,
    readonly reason: string,
  ) {
    super(
      `Dashboard "${dashboardId}" exists but cannot be read (${reason}); refusing to treat it as absent.`,
    )
    this.name = "DashboardUnreadableError"
  }
}

/**
 * Throw {@link DashboardOwnershipError} unless `userId` may update `existing`
 * ({@link isDashboardOwnedBy}). Shared by {@link resolveSavedRecord} and the
 * dashboard tools, which re-check a custom store's answer before a save.
 */
export function assertDashboardWritable(
  existing: DashboardRecord,
  userId: string | undefined,
): void {
  if (isDashboardOwnedBy(existing.userId, userId)) return
  throw new DashboardOwnershipError(
    existing.userId
      ? `Access denied: dashboard "${existing.id}" is owned by another user.`
      : `Access denied: dashboard "${existing.id}" has no owner; an owner-less (global-scope) dashboard is not writable by an identified caller.`,
  )
}

/**
 * Resolve the record to persist for a `save`, enforcing ownership on updates.
 *
 * - New record (no `existing`): returns `null`, signalling the caller to
 *   create from `input`.
 * - Update (`existing` present): throws {@link DashboardOwnershipError} when
 *   `input.userId` doesn't own `existing`, otherwise returns the merged
 *   record with `id`, `createdAt`, and — critically — `existing.userId`
 *   preserved so `input.userId` can never reassign the owner.
 *
 * Without an `input.userId` (global scope: a host booted without OAuth) every
 * record is writable, so single-user deployments keep working. An identified
 * actor owns only records stamped with its id — an owner-less record is
 * refused, never silently claimed.
 *
 * Exported for unit testing; the store factories below are the public API.
 */
export function resolveSavedRecord(
  existing: DashboardRecord | undefined,
  input: DashboardSaveInput,
  now: string,
): DashboardRecord | null {
  if (!existing) return null
  assertDashboardWritable(existing, input.userId)
  return {
    ...existing,
    ...stripUndefined(input),
    id: existing.id,
    userId: existing.userId,
    schemaVersion: DASHBOARD_SCHEMA_VERSION,
    createdAt: existing.createdAt,
    updatedAt: now,
  }
}

/**
 * Process-local in-memory store. Fine for tests and throwaway demos; loses
 * everything on restart. Default when `createFrameworkApp` is called
 * without an explicit `dashboardStore`.
 */
export function createInMemoryDashboardStore(): DashboardStore {
  const byId = new Map<string, DashboardRecord>()

  return {
    save(input) {
      // Resolve-then-compute so a synchronous ownership violation surfaces as
      // a rejected promise (matching the `Promise<DashboardRecord>` contract
      // and the filesystem store), not a throw escaping the call site.
      return Promise.resolve().then(() => {
        const now = nowIso()
        const existing = input.id ? byId.get(input.id) : undefined
        const record: DashboardRecord = resolveSavedRecord(existing, input, now) ?? {
          id: input.id ?? randomUUID(),
          name: input.name,
          description: input.description,
          userId: input.userId,
          keys: input.keys,
          steps: input.steps,
          layout: input.layout,
          title: input.title,
          schemaVersion: DASHBOARD_SCHEMA_VERSION,
          createdAt: now,
          updatedAt: now,
        }
        byId.set(record.id, record)
        return record
      })
    },
    list(filter) {
      const all = [...byId.values()].filter((r) => isDashboardOwnedBy(r.userId, filter.userId))
      all.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      return Promise.resolve(all.map(summaryOf))
    },
    get(id, filter) {
      const record = byId.get(id)
      if (!record) return Promise.resolve(undefined)
      if (!isDashboardOwnedBy(record.userId, filter.userId)) return Promise.resolve(undefined)
      return Promise.resolve(record)
    },
    delete(id, filter) {
      const record = byId.get(id)
      if (!record) return Promise.resolve(false)
      if (!isDashboardOwnedBy(record.userId, filter.userId)) return Promise.resolve(false)
      byId.delete(id)
      return Promise.resolve(true)
    },
  }
}

export interface FileSystemDashboardStoreOptions {
  /** Directory where `<id>.json` files are written. Created on first save. */
  dir: string
}

/**
 * What a record file holds, as far as this build can tell. `unreadable`
 * carries the owner only when the raw JSON still names one — an unknown
 * owner is never assumed to be the caller.
 */
type StoredDashboard =
  | { state: "absent" }
  | { state: "readable"; record: DashboardRecord }
  | { state: "unreadable"; reason: string; ownerId?: string; updatedAt?: string }

function classifyStoredDashboard(raw: string): StoredDashboard {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return { state: "unreadable", reason: "file is not valid JSON" }
  }
  const record = parseDashboardRecord(parsed)
  if (record) return { state: "readable", record }
  const fields =
    typeof parsed === "object" && parsed !== null ? (parsed as Record<string, unknown>) : {}
  const version = fields.schemaVersion
  return {
    state: "unreadable",
    reason:
      typeof version === "number" && version > DASHBOARD_SCHEMA_VERSION
        ? `written by a newer schemaVersion ${version} (this build reads up to ${DASHBOARD_SCHEMA_VERSION})`
        : "does not match the current record schema",
    ...(typeof fields.userId === "string" ? { ownerId: fields.userId } : {}),
    ...(typeof fields.updatedAt === "string" ? { updatedAt: fields.updatedAt } : {}),
  }
}

/**
 * Whether an unreadable record addressed BY ID concerns the caller: global
 * scope, its own record, or one whose owner cannot be told (then the caller
 * learns it exists — the same as the ownership error on a foreign save).
 */
function unreadableAddressableBy(ownerId: string | undefined, userId: string | undefined): boolean {
  return ownerId === undefined || isDashboardOwnedBy(ownerId, userId)
}

/**
 * Dashboards stored as one JSON file per record under `dir`. Suitable for
 * single-node deployments that need survival across restarts. Writes are
 * atomic (temp file + rename), so a crash never leaves a torn record.
 * Locking is advisory: concurrent writes of the same id can race — fine for
 * the v1 "single user clicking Save" workflow, not fine for multi-writer
 * production.
 */
export function createFileSystemDashboardStore(
  options: FileSystemDashboardStoreOptions,
): DashboardStore {
  const { dir } = options

  const ensureDir = async () => {
    await fs.mkdir(dir, { recursive: true })
  }

  const fileFor = (id: string) => path.join(dir, `${encodeURIComponent(id)}.json`)

  const idOfFile = (name: string): string => {
    const encoded = name.slice(0, -".json".length)
    try {
      return decodeURIComponent(encoded)
    } catch {
      return encoded
    }
  }

  const readStored = async (file: string, id: string): Promise<StoredDashboard> => {
    let raw: string
    try {
      raw = await fs.readFile(file, "utf-8")
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return { state: "absent" }
      throw err
    }
    const stored = classifyStoredDashboard(raw)
    if (stored.state === "unreadable") {
      console.warn(`[dashboard-store] Dashboard "${id}" is unreadable: ${stored.reason}.`)
    }
    return stored
  }

  /**
   * `readStored` for one directory entry of a listing: an entry the filesystem
   * refuses (a directory named `*.json`, EACCES, EIO) becomes an unreadable
   * record of unknown owner instead of rejecting the whole listing.
   */
  const readListed = async (name: string, id: string): Promise<StoredDashboard> => {
    try {
      return await readStored(path.join(dir, name), id)
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code ?? "read error"
      console.warn(`[dashboard-store] Dashboard "${id}" cannot be read: ${code}.`)
      return { state: "unreadable", reason: `cannot be read (${code})` }
    }
  }

  const writeRecord = async (record: DashboardRecord) => {
    await ensureDir()
    const target = fileFor(record.id)
    const temp = `${target}.${randomUUID()}.tmp`
    await fs.writeFile(temp, JSON.stringify(record, null, 2), "utf-8")
    await fs.rename(temp, target)
  }

  return {
    async save(input) {
      const now = nowIso()
      const stored: StoredDashboard = input.id
        ? await readStored(fileFor(input.id), input.id)
        : { state: "absent" }
      if (stored.state === "unreadable") {
        // `input.id` is set: only an addressed record can be found unreadable.
        const id = input.id ?? ""
        if (!unreadableAddressableBy(stored.ownerId, input.userId)) {
          throw new DashboardOwnershipError(
            `Access denied: dashboard "${id}" is owned by another user.`,
          )
        }
        throw new DashboardUnreadableError(id, stored.reason)
      }
      const existing = stored.state === "readable" ? stored.record : undefined
      const record: DashboardRecord = resolveSavedRecord(existing, input, now) ?? {
        id: input.id ?? randomUUID(),
        name: input.name,
        description: input.description,
        userId: input.userId,
        keys: input.keys,
        steps: input.steps,
        layout: input.layout,
        title: input.title,
        schemaVersion: DASHBOARD_SCHEMA_VERSION,
        createdAt: now,
        updatedAt: now,
      }
      await writeRecord(record)
      return record
    },
    async list(filter) {
      await ensureDir()
      const entries = await fs.readdir(dir)
      const summaries: DashboardSummary[] = []
      for (const name of entries) {
        if (!name.endsWith(".json")) continue
        const id = idOfFile(name)
        const stored = await readListed(name, id)
        if (stored.state === "readable") {
          if (!isDashboardOwnedBy(stored.record.userId, filter.userId)) continue
          summaries.push(summaryOf(stored.record))
        } else if (
          stored.state === "unreadable" &&
          isDashboardOwnedBy(stored.ownerId, filter.userId)
        ) {
          // Listed only where it is attributable (or in global scope): a list
          // must not enumerate ids an identified caller cannot be tied to.
          summaries.push({
            id,
            name: id,
            ...(stored.ownerId === undefined ? {} : { userId: stored.ownerId }),
            updatedAt: stored.updatedAt ?? "",
            unreadable: stored.reason,
          })
        }
      }
      summaries.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      return summaries
    },
    async get(id, filter) {
      const stored = await readStored(fileFor(id), id)
      if (stored.state === "absent") return undefined
      if (stored.state === "unreadable") {
        if (!unreadableAddressableBy(stored.ownerId, filter.userId)) return undefined
        throw new DashboardUnreadableError(id, stored.reason)
      }
      return isDashboardOwnedBy(stored.record.userId, filter.userId) ? stored.record : undefined
    },
    async delete(id, filter) {
      const stored = await readStored(fileFor(id), id)
      if (stored.state === "absent") return false
      if (stored.state === "unreadable") {
        if (!unreadableAddressableBy(stored.ownerId, filter.userId)) return false
        throw new DashboardUnreadableError(id, stored.reason)
      }
      if (!isDashboardOwnedBy(stored.record.userId, filter.userId)) return false
      await fs.rm(fileFor(id), { force: true })
      return true
    },
  }
}

function summaryOf(record: DashboardRecord): DashboardSummary {
  return {
    id: record.id,
    name: record.name,
    description: record.description,
    title: record.title,
    userId: record.userId,
    updatedAt: record.updatedAt,
  }
}

function stripUndefined<T extends object>(obj: T): Partial<T> {
  const out: Partial<T> = {}
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) (out as Record<string, unknown>)[k] = v
  }
  return out
}
