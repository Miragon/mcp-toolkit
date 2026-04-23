import { z } from "zod"

/**
 * Contract for MCP upstream-proxy configuration. Admin tooling (a portal,
 * a CLI, or a config file) produces the JSON shape defined here; the MCP
 * server parses the same shape at boot to instantiate `UpstreamProxyPlugin`s.
 *
 * Keeping the definition in its own package means both sides compile against
 * the same types and the same Zod validator — drift across the two is a
 * compile-time error instead of a runtime surprise.
 */

export {
  MODULE_ID_PATTERN,
  NAMESPACED_ID_PATTERN,
  RuntimeRequirementSchema,
  DeclarativeStepSchema,
  RemoteWidgetSchema,
  ModuleManifestSchema,
  GET_MODULE_MANIFEST_TOOL,
} from "./module-manifest.js"
export type {
  RuntimeRequirement,
  DeclarativeStep,
  RemoteWidget,
  ModuleManifest,
} from "./module-manifest.js"

// Proxy names become a tool-name prefix (`<proxy>_<tool>`) and a route segment
// (`/oauth/callback/<proxy>`). Keep them URL-safe and MCP-tool-name-safe.
export const PROXY_NAME_PATTERN = /^[a-z][a-z0-9-]*$/

const envVarName = z.string().regex(/^[A-Z][A-Z0-9_]*$/, "must be UPPER_SNAKE_CASE")

const proxyAuthSchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("none") }),
  z.object({
    mode: z.literal("bearer"),
    tokenEnvVar: envVarName,
  }),
  z.object({
    mode: z.literal("header"),
    headerName: z.string().min(1),
    valueEnvVar: envVarName,
  }),
  z.object({
    mode: z.literal("oauth2"),
    clientIdEnvVar: envVarName.optional(),
    clientSecretEnvVar: envVarName.optional(),
    scopes: z.array(z.string().min(1)).optional(),
  }),
])

export const ProxyConfigEntrySchema = z.object({
  name: z.string().regex(PROXY_NAME_PATTERN),
  label: z.string().min(1),
  upstreamUrl: z.string().url(),
  auth: proxyAuthSchema,
  /**
   * Opt-in: when true, the host calls `get-module-manifest` on this upstream
   * at boot and registers any returned widgets/steps into its framework
   * registries. See `@miragon/mcp-toolkit-proxy-contract/module-manifest`.
   */
  upstreamModules: z.boolean().optional(),
})

export const ProxyConfigSchema = z.array(ProxyConfigEntrySchema).superRefine((entries, ctx) => {
  const seen = new Set<string>()
  for (const [index, entry] of entries.entries()) {
    if (seen.has(entry.name)) {
      ctx.addIssue({
        code: "custom",
        path: [index, "name"],
        message: `duplicate proxy name "${entry.name}"`,
      })
    }
    seen.add(entry.name)
  }
})

export type ProxyAuthConfig = z.infer<typeof proxyAuthSchema>
export type ProxyConfigEntry = z.infer<typeof ProxyConfigEntrySchema>
export type ProxyConfig = z.infer<typeof ProxyConfigSchema>

/**
 * Default prefix for per-proxy secret env vars. Consumers that want a
 * branded namespace (e.g. `MIRANUM_PROXY_*`) pass their own prefix to
 * `proxySecretEnvVar` / `proxySecretEnvVars`.
 */
export const DEFAULT_PROXY_SECRET_PREFIX = "MCP_PROXY"

/** Parse a raw proxy-config env value. Empty / unset → empty array. */
export function parseProxyConfigEnv(raw: string | undefined): ProxyConfig {
  if (!raw || raw.trim() === "") return []
  const parsed: unknown = JSON.parse(raw)
  return ProxyConfigSchema.parse(parsed)
}

/** Serialize the canonical form — a compact single-line JSON string. */
export function serializeProxyConfig(config: ProxyConfig): string {
  return JSON.stringify(ProxyConfigSchema.parse(config))
}

/**
 * Canonical env-var name for a proxy's upstream secret. Keeps admin tooling
 * and server in agreement without making the admin type env-var names.
 *
 * bearer → `<PREFIX>_<NAME>_TOKEN`
 * header → `<PREFIX>_<NAME>_VALUE`
 * others → `undefined` (no secret to store)
 */
export function proxySecretEnvVar(
  proxyName: string,
  mode: ProxyAuthConfig["mode"],
  prefix: string = DEFAULT_PROXY_SECRET_PREFIX,
): string | undefined {
  const base = `${prefix}_${proxyName.replace(/-/g, "_").toUpperCase()}`
  if (mode === "bearer") return `${base}_TOKEN`
  if (mode === "header") return `${base}_VALUE`
  return undefined
}

/**
 * Env-var names referenced by a proxy config entry (what the machine needs
 * materialized from a secret store). Empty array for `none` / `oauth2` modes.
 */
export function proxySecretEnvVars(entry: ProxyConfigEntry): string[] {
  switch (entry.auth.mode) {
    case "bearer":
      return [entry.auth.tokenEnvVar]
    case "header":
      return [entry.auth.valueEnvVar]
    case "none":
    case "oauth2":
      return []
  }
}
