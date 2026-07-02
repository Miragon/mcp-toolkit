import fs from "node:fs/promises"
import path from "node:path"
import { randomUUID } from "node:crypto"
import { z } from "zod"
import type { PipelineStepRef } from "../types/pipeline.js"
import type { LayoutConfig } from "./layout-types.js"
import { layoutSchema } from "./layout-schemas.js"

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
 * `userId` is copied from `ctx.auth.user.userId` on save when present.
 */
export interface DashboardRecord {
  id: string
  name: string
  description?: string
  /** Owner; omitted when the host boots without OAuth (global scope). */
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
}

/**
 * Persistence backing for dashboards. The framework is indifferent to how
 * records are stored — consumers inject whichever implementation fits
 * their deployment (in-memory for tests, filesystem for local dev, a DB-
 * backed one for production).
 *
 * All methods accept an optional `userId` filter so implementations can
 * enforce ownership. Implementations that don't need ownership (global
 * scope) should simply ignore the filter.
 *
 * `save` carries the acting user as `input.userId`: updating an existing
 * record owned by a different user is rejected with
 * {@link DashboardOwnershipError}, and `input.userId` can never reassign an
 * existing record's owner. Records persisted without a `userId` (global
 * scope) stay writable by anyone, matching the read/delete convention.
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

function ownedBy(record: DashboardRecord, userId: string | undefined): boolean {
  if (!userId) return true
  if (!record.userId) return true
  return record.userId === userId
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
 * Resolve the record to persist for a `save`, enforcing ownership on updates.
 *
 * - New record (no `existing`): returns `null`, signalling the caller to
 *   create from `input`.
 * - Update (`existing` present): throws {@link DashboardOwnershipError} when
 *   `input.userId` doesn't own `existing`, otherwise returns the merged
 *   record with `id`, `createdAt`, and — critically — `existing.userId`
 *   preserved so `input.userId` can never reassign the owner.
 *
 * Records without a `userId` (global scope, e.g. a host booted without OAuth)
 * are deliberately writable by anyone — same convention `ownedBy` uses for
 * read/delete — so single-user and OAuth-less deployments keep working.
 *
 * Exported for unit testing; the store factories below are the public API.
 */
export function resolveSavedRecord(
  existing: DashboardRecord | undefined,
  input: DashboardSaveInput,
  now: string,
): DashboardRecord | null {
  if (!existing) return null
  if (!ownedBy(existing, input.userId)) {
    throw new DashboardOwnershipError(
      `Access denied: dashboard "${existing.id}" is owned by another user.`,
    )
  }
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
      const all = [...byId.values()].filter((r) => ownedBy(r, filter.userId))
      all.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      return Promise.resolve(
        all.map((r) => ({
          id: r.id,
          name: r.name,
          description: r.description,
          title: r.title,
          updatedAt: r.updatedAt,
        })),
      )
    },
    get(id, filter) {
      const record = byId.get(id)
      if (!record) return Promise.resolve(undefined)
      if (!ownedBy(record, filter.userId)) return Promise.resolve(undefined)
      return Promise.resolve(record)
    },
    delete(id, filter) {
      const record = byId.get(id)
      if (!record) return Promise.resolve(false)
      if (!ownedBy(record, filter.userId)) return Promise.resolve(false)
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
 * Dashboards stored as one JSON file per record under `dir`. Suitable for
 * single-node deployments that need survival across restarts. Locking is
 * advisory: concurrent writes of the same id can race — fine for the v1
 * "single user clicking Save" workflow, not fine for multi-writer
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

  const readRecord = async (id: string): Promise<DashboardRecord | undefined> => {
    let raw: string
    try {
      raw = await fs.readFile(fileFor(id), "utf-8")
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return undefined
      throw err
    }
    // Corrupt/incompatible content is treated as "not present" (fail-soft) so a
    // single bad file can't crash `get`/`save`; a real fs error above still
    // throws.
    let parsed: unknown
    try {
      parsed = JSON.parse(raw)
    } catch {
      console.warn(`[dashboard-store] Ignoring dashboard "${id}": file is not valid JSON.`)
      return undefined
    }
    const record = parseDashboardRecord(parsed)
    if (!record) {
      console.warn(
        `[dashboard-store] Ignoring dashboard "${id}": does not match the current record schema.`,
      )
    }
    return record
  }

  const writeRecord = async (record: DashboardRecord) => {
    await ensureDir()
    await fs.writeFile(fileFor(record.id), JSON.stringify(record, null, 2), "utf-8")
  }

  return {
    async save(input) {
      const now = nowIso()
      const existing = input.id ? await readRecord(input.id) : undefined
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
      const records: DashboardRecord[] = []
      for (const name of entries) {
        if (!name.endsWith(".json")) continue
        let parsed: unknown
        try {
          parsed = JSON.parse(await fs.readFile(path.join(dir, name), "utf-8"))
        } catch {
          // Not valid JSON — not one of our records. Skip.
          continue
        }
        // Validate before trusting: a partial record (e.g. missing `updatedAt`)
        // would otherwise crash the sort below and take the whole listing down.
        const record = parseDashboardRecord(parsed)
        if (!record) {
          console.warn(`[dashboard-store] Skipping "${name}": does not match the record schema.`)
          continue
        }
        if (ownedBy(record, filter.userId)) records.push(record)
      }
      records.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      return records.map((r) => ({
        id: r.id,
        name: r.name,
        description: r.description,
        title: r.title,
        updatedAt: r.updatedAt,
      }))
    },
    async get(id, filter) {
      const record = await readRecord(id)
      if (!record) return undefined
      if (!ownedBy(record, filter.userId)) return undefined
      return record
    },
    async delete(id, filter) {
      const record = await readRecord(id)
      if (!record) return false
      if (!ownedBy(record, filter.userId)) return false
      await fs.rm(fileFor(id), { force: true })
      return true
    },
  }
}

function stripUndefined<T extends object>(obj: T): Partial<T> {
  const out: Partial<T> = {}
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) (out as Record<string, unknown>)[k] = v
  }
  return out
}
