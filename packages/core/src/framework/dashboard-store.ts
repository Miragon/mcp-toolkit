import fs from "node:fs/promises"
import path from "node:path"
import { randomUUID } from "node:crypto"
import type { PipelineStepRef } from "../types/pipeline.js"
import type { LayoutConfig } from "./layout-types.js"

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
 */
export interface DashboardStore {
  save(input: DashboardSaveInput): Promise<DashboardRecord>
  list(filter: DashboardListFilter): Promise<DashboardSummary[]>
  get(id: string, filter: DashboardListFilter): Promise<DashboardRecord | undefined>
  delete(id: string, filter: DashboardListFilter): Promise<boolean>
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
 * Process-local in-memory store. Fine for tests and throwaway demos; loses
 * everything on restart. Default when `createFrameworkApp` is called
 * without an explicit `dashboardStore`.
 */
export function createInMemoryDashboardStore(): DashboardStore {
  const byId = new Map<string, DashboardRecord>()

  return {
    save(input) {
      const now = nowIso()
      const existing = input.id ? byId.get(input.id) : undefined
      const record: DashboardRecord = existing
        ? { ...existing, ...stripUndefined(input), id: existing.id, updatedAt: now }
        : {
            id: input.id ?? randomUUID(),
            name: input.name,
            description: input.description,
            userId: input.userId,
            keys: input.keys,
            steps: input.steps,
            layout: input.layout,
            title: input.title,
            createdAt: now,
            updatedAt: now,
          }
      byId.set(record.id, record)
      return Promise.resolve(record)
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
    try {
      const raw = await fs.readFile(fileFor(id), "utf-8")
      return JSON.parse(raw) as DashboardRecord
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return undefined
      throw err
    }
  }

  const writeRecord = async (record: DashboardRecord) => {
    await ensureDir()
    await fs.writeFile(fileFor(record.id), JSON.stringify(record, null, 2), "utf-8")
  }

  return {
    async save(input) {
      const now = nowIso()
      const existing = input.id ? await readRecord(input.id) : undefined
      const record: DashboardRecord = existing
        ? { ...existing, ...stripUndefined(input), id: existing.id, updatedAt: now }
        : {
            id: input.id ?? randomUUID(),
            name: input.name,
            description: input.description,
            userId: input.userId,
            keys: input.keys,
            steps: input.steps,
            layout: input.layout,
            title: input.title,
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
        try {
          const raw = await fs.readFile(path.join(dir, name), "utf-8")
          const record = JSON.parse(raw) as DashboardRecord
          if (ownedBy(record, filter.userId)) records.push(record)
        } catch {
          // Skip files that fail to parse — they're not our records.
        }
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
