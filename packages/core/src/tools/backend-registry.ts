/**
 * Default backend-selection TTL: how long a session's sticky pick survives
 * without being re-set. `mcp-use` exposes no session-close hook to plugins, so
 * without eviction the per-session selection map would grow with every MCP
 * session that ever selected a backend. 24h comfortably outlives any real
 * session.
 */
export const DEFAULT_BACKEND_SESSION_TTL_MS = 24 * 60 * 60 * 1000

/** A single addressable backend: a stable `id`, its `client`, and free-form `meta`. */
export interface BackendEntry<TClient, TMeta = undefined> {
  id: string
  client: TClient
  meta?: TMeta
}

/** A resolved backend handed to a tool handler. */
export interface ResolvedBackend<TClient, TMeta = undefined> {
  id: string
  client: TClient
  meta: TMeta | undefined
}

/**
 * Fallback session resolver: always `undefined`.
 *
 * Until mcp-use 2.x this read the `Mcp-Session-Id` header off an ambient Hono
 * context that `mcp-use` propagated through AsyncLocalStorage. 2.x removed
 * `getRequestContext()` — a request's context now only reaches code that is
 * handed it, and the transport is session-less by default — so there is no
 * ambient source left to read.
 *
 * Returning `undefined` keeps the documented fail-soft path: resolution falls
 * back to the lone default backend, so single-backend setups are unaffected.
 * **Sticky per-session selection across several backends now requires passing
 * {@link CreateBackendRegistryOptions.getSessionId} explicitly** — from a tool
 * handler, `(ctx) => ctx.session?.sessionId` is the 2.x equivalent.
 */
function defaultGetSessionId(): string | undefined {
  return undefined
}

export interface CreateBackendRegistryOptions {
  /** Sticky-selection TTL in ms (default: {@link DEFAULT_BACKEND_SESSION_TTL_MS}). */
  sessionTtlMs?: number
  /**
   * Noun used in error messages and the select-instruction hint, e.g.
   * `"engine"` → "No engine selected for this session." Defaults to
   * `"backend"`.
   */
  label?: string
  /**
   * Resolves the current MCP session id, which keys the sticky per-session
   * backend selection.
   *
   * **Required for multi-backend sticky selection since mcp-use 2.x.** The
   * default returns `undefined` (see {@link defaultGetSessionId}), which makes
   * every call fall back to the single default backend. Pass a resolver that
   * reads the session off your tool handler's context —
   * `(ctx) => ctx.session?.sessionId` — or off whatever your host keys
   * sessions by.
   */
  getSessionId?: () => string | undefined
  /**
   * Clock used for TTL bookkeeping, in ms. Defaults to `Date.now`. Injectable
   * so tests can drive eviction deterministically.
   */
  now?: () => number
}

/**
 * Thrown when a tool is invoked but no backend has been selected for the
 * current MCP session and the registry holds more than one backend.
 *
 * The message lists the available ids because the error path commonly only
 * serialises `code` + `message` (the structured `availableIds` field may not
 * reach the model) — naming them saves the model a discovery roundtrip before
 * it can pick one and select it.
 */
export class BackendNotSelectedError extends Error {
  readonly code = "BACKEND_NOT_SELECTED" as const
  readonly availableIds: string[]
  constructor(availableIds: string[], label: string) {
    super(
      `No ${label} selected for this session. Available ${label}s: ${availableIds.join(", ")}. ` +
        `Select one for this session first.`,
    )
    this.name = "BackendNotSelectedError"
    this.availableIds = availableIds
  }
}

/** Thrown when an override or sticky selection names a backend that isn't registered. */
export class UnknownBackendError extends Error {
  readonly code = "UNKNOWN_BACKEND" as const
  readonly requestedId: string
  readonly availableIds: string[]
  constructor(requestedId: string, availableIds: string[], label: string) {
    super(`Unknown ${label} id "${requestedId}". Available: ${availableIds.join(", ")}.`)
    this.name = "UnknownBackendError"
    this.requestedId = requestedId
    this.availableIds = availableIds
  }
}

/**
 * A session-aware registry of interchangeable backends (Camunda engines, REST
 * hosts, tenants, …). Resolves the backend for a tool call by precedence:
 *   1. an explicit per-call `override` wins,
 *   2. otherwise the sticky session selection,
 *   3. otherwise, if exactly one backend is configured, that one,
 *   4. otherwise throws {@link BackendNotSelectedError}.
 *
 * Sticky selections are kept per MCP session and evicted by a lazy TTL sweep
 * (no timer): expired entries are dropped on read and on the next `select`.
 */
export interface BackendRegistry<TClient, TMeta = undefined> {
  /** Resolve the backend for the current call (precedence: override > sticky > single default). */
  resolve(override?: string): ResolvedBackend<TClient, TMeta>
  /** Pin `id` as the sticky selection for the current MCP session. */
  select(id: string): void
  /** Clear the sticky selection for a given session id (no-op if none). */
  clear(sessionId: string): void
  /** List every registered backend (id + meta), in registration order. */
  list(): { id: string; meta: TMeta | undefined }[]
  /**
   * The id sticky-selected for the current session, or `undefined` when none
   * is selected (or the selection has outlived the TTL). Unlike {@link resolve},
   * it never falls back to a single configured default and never throws — it
   * reports only an explicit sticky selection, which is what a "what is
   * currently selected?" reader needs: a select-tool's `current` action, or
   * surfacing the active pick alongside `list`.
   */
  getSelected(): string | undefined
}

interface SessionSelection {
  id: string
  selectedAt: number
}

/**
 * Builds a {@link BackendRegistry} from a non-empty list of backend entries.
 * Throws if `entries` is empty or contains duplicate ids — both are
 * programmer errors that should fail at boot rather than at the first tool
 * call.
 */
export function createBackendRegistry<TClient, TMeta = undefined>(
  entries: BackendEntry<TClient, TMeta>[],
  opts: CreateBackendRegistryOptions = {},
): BackendRegistry<TClient, TMeta> {
  if (entries.length === 0) {
    throw new Error("createBackendRegistry requires at least one backend entry")
  }
  const byId = new Map<string, BackendEntry<TClient, TMeta>>()
  for (const entry of entries) {
    if (byId.has(entry.id)) {
      throw new Error(`createBackendRegistry: duplicate backend id "${entry.id}"`)
    }
    byId.set(entry.id, entry)
  }

  const label = opts.label ?? "backend"
  const ttlMs = opts.sessionTtlMs ?? DEFAULT_BACKEND_SESSION_TTL_MS
  const getSessionId = opts.getSessionId ?? defaultGetSessionId
  const now = opts.now ?? Date.now

  const sessionSelections = new Map<string, SessionSelection>()
  const availableIds = (): string[] => [...byId.keys()]

  const isExpired = (entry: SessionSelection): boolean => now() - entry.selectedAt > ttlMs

  const sweepExpired = (): void => {
    for (const [sid, entry] of sessionSelections) {
      if (isExpired(entry)) sessionSelections.delete(sid)
    }
  }

  const stickySelection = (): string | undefined => {
    const sid = getSessionId()
    if (!sid) return undefined
    const entry = sessionSelections.get(sid)
    if (!entry) return undefined
    if (isExpired(entry)) {
      sessionSelections.delete(sid)
      return undefined
    }
    return entry.id
  }

  const get = (id: string): ResolvedBackend<TClient, TMeta> => {
    const entry = byId.get(id)
    if (!entry) throw new UnknownBackendError(id, availableIds(), label)
    return { id: entry.id, client: entry.client, meta: entry.meta }
  }

  return {
    resolve(override?: string): ResolvedBackend<TClient, TMeta> {
      if (override) return get(override)

      const sticky = stickySelection()
      if (sticky) return get(sticky)

      if (byId.size === 1) {
        const [only] = byId.values()
        return { id: only!.id, client: only!.client, meta: only!.meta }
      }

      throw new BackendNotSelectedError(availableIds(), label)
    },

    select(id: string): void {
      if (!byId.has(id)) throw new UnknownBackendError(id, availableIds(), label)
      const sid = getSessionId()
      if (!sid) {
        throw new Error(`No active MCP session — cannot store a ${label} selection`)
      }
      sweepExpired()
      sessionSelections.set(sid, { id, selectedAt: now() })
    },

    clear(sessionId: string): void {
      sessionSelections.delete(sessionId)
    },

    list(): { id: string; meta: TMeta | undefined }[] {
      return [...byId.values()].map((entry) => ({ id: entry.id, meta: entry.meta }))
    },

    getSelected(): string | undefined {
      return stickySelection()
    },
  }
}

/**
 * Lifts a handler written against a single resolved backend into one that
 * resolves the backend from `registry` (override > sticky > single default)
 * before delegating. The override is read from `args[paramName]`, so a tool
 * adds backend selection by spreading an optional `{ [paramName]: z.string() }`
 * into its input schema and wrapping its handler in `withBackend(...)`.
 */
export function withBackend<TClient, TMeta, TArgs extends Record<string, unknown>, TResult>(
  registry: BackendRegistry<TClient, TMeta>,
  paramName: string,
  fn: (backend: ResolvedBackend<TClient, TMeta>, args: TArgs) => Promise<TResult>,
): (args: TArgs) => Promise<TResult> {
  return (args: TArgs) => {
    const override = args[paramName]
    const backend = registry.resolve(typeof override === "string" ? override : undefined)
    return fn(backend, args)
  }
}
