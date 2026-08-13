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

export interface CreateBackendRegistryOptions {
  /**
   * Noun used in error messages, e.g. `"engine"` → "No engine specified."
   * Defaults to `"backend"`.
   */
  label?: string
}

/**
 * Thrown when a tool is invoked without an explicit backend id and the
 * registry holds more than one backend.
 *
 * The message lists the available ids because the error path commonly only
 * serialises `code` + `message` (the structured `availableIds` field may not
 * reach the model) — naming them saves the model a discovery roundtrip before
 * it can pick one.
 */
export class BackendNotSelectedError extends Error {
  readonly code = "BACKEND_NOT_SELECTED" as const
  readonly availableIds: string[]
  constructor(availableIds: string[], label: string) {
    super(
      `No ${label} specified and more than one is configured. ` +
        `Available ${label}s: ${availableIds.join(", ")}. Pass an explicit ${label} id.`,
    )
    this.name = "BackendNotSelectedError"
    this.availableIds = availableIds
  }
}

/** Thrown when an explicit id names a backend that isn't registered. */
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
 * A stateless registry of interchangeable backends (Camunda engines, REST
 * hosts, tenants, …). Resolves the backend for a tool call by precedence:
 *   1. an explicit per-call `id` wins,
 *   2. otherwise, if exactly one backend is configured, that one,
 *   3. otherwise throws {@link BackendNotSelectedError}.
 *
 * The registry deliberately keeps NO per-session selection state: MCP servers
 * built on mcp-use 2.x serve HTTP statelessly (no session ids to key on), and
 * in-memory selection state breaks behind any load balancer with more than one
 * replica. A consumer that wants a sticky/default backend resolves that id
 * itself — e.g. from a durable per-user profile — and passes it to `resolve`
 * when the caller gave no explicit override.
 */
export interface BackendRegistry<TClient, TMeta = undefined> {
  /** Resolve the backend for the current call (precedence: explicit id > single default). */
  resolve(id?: string): ResolvedBackend<TClient, TMeta>
  /** List every registered backend (id + meta), in registration order. */
  list(): { id: string; meta: TMeta | undefined }[]
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
  const availableIds = (): string[] => [...byId.keys()]

  const get = (id: string): ResolvedBackend<TClient, TMeta> => {
    const entry = byId.get(id)
    if (!entry) throw new UnknownBackendError(id, availableIds(), label)
    return { id: entry.id, client: entry.client, meta: entry.meta }
  }

  return {
    resolve(id?: string): ResolvedBackend<TClient, TMeta> {
      if (id) return get(id)

      if (byId.size === 1) {
        const [only] = byId.values()
        return { id: only!.id, client: only!.client, meta: only!.meta }
      }

      throw new BackendNotSelectedError(availableIds(), label)
    },

    list(): { id: string; meta: TMeta | undefined }[] {
      return [...byId.values()].map((entry) => ({ id: entry.id, meta: entry.meta }))
    },
  }
}

/**
 * Lifts a handler written against a single resolved backend into one that
 * resolves the backend from `registry` (explicit id > single default) before
 * delegating. The id is read from `args[paramName]`, so a tool adds backend
 * selection by spreading an optional `{ [paramName]: z.string() }` into its
 * input schema and wrapping its handler in `withBackend(...)`.
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
