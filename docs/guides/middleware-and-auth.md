# Middleware and auth

Authentication enters through the mcp-use `oauth` provider (Keycloak, Auth0,
WorkOS, …); the toolkit adds two middleware helpers on top for org scoping and
role-based tool filtering, and scopes dashboards per caller.

## Stack

```
MCP transport
    │
    ▼
oauth provider          ← mcp-use: verifies the bearer token, maps the user
    │                     (built-in providers: { id, roles?, organizationId? })
    ▼
mcp:* org-gate          ← createOrgGateMiddleware(orgId)
    │
    ▼
mcp:tools/list          ← role-filter toolsList
mcp:tools/call          ← role-filter toolsCall
    │
    ▼
tool handler            ← plugin.registerTools / framework tools
```

## Who is calling: two `ctx.auth` shapes

mcp-use 2 hands the provider-mapped user to the two layers differently:

| Where                                  | `ctx.auth` is                  | The mapped user sits at |
| -------------------------------------- | ------------------------------ | ----------------------- |
| MCP middleware (`server.use("mcp:…")`) | the SDK `AuthInfo`             | `ctx.auth.extra.user`   |
| Tool / resource / prompt callbacks     | `{ user, payload, scopes, … }` | `ctx.auth.user`         |

The built-in providers map the user with `id` (never `userId`) and the
organization as `organizationId`. Read the caller through the toolkit instead
of either path:

```ts
import { resolveCaller, resolveCallerId } from "@miragon/mcp-toolkit-core"

server.use("mcp:tools/call", async (ctx, next) => {
  const caller = resolveCaller(ctx) // middleware shape
  // caller → { userId?, organizationId?, roles } | undefined
  return next()
})

server.tool(
  { name: "whoami", description: "…" },
  (_args, ctx) => textResult(resolveCallerId(ctx) ?? "anonymous"), // callback shape
)
```

`resolveCaller` reads both shapes and both spellings: `userId` is `user.id`,
else `user.userId`, else the verified token's `sub`; `organizationId` is
`user.organizationId`, else `user.organization_id`. It returns `undefined` only
when the request carries no auth at all; an authenticated caller whose provider
maps no id still yields a caller (without `userId`) — per-user data must refuse
it, never widen to global scope. The role filter, the org gate, the dashboard
tools and the `render-view` / `refresh-view` / `get-builder-catalogue` pipeline
context all resolve the caller this way.

## Authentication

`createFrameworkApp` accepts an `oauth?: OAuthProvider` option. Example
with WorkOS:

```ts
import { oauthWorkOSProvider } from "mcp-use/oauth/workos"

await createFrameworkApp({
  ...,
  oauth: oauthWorkOSProvider({ subdomain: process.env.WORKOS_SUBDOMAIN! }),
  ...
})
```

Skip the option for unauthenticated development servers — the framework tools
still work (steps then see `userId: undefined`, dashboards live in one global
scope).

Any mcp-use provider factory works here — the toolkit only sees the resolved
`OAuthProvider`, and pass it as-is: no wrapper that copies `id` to `userId` is
needed. Since mcp-use 2.3.0 that includes `oauthScalekitProvider` from
`mcp-use/oauth/scalekit`, which binds the JWT audience to a Scalekit `res_…`
resource id. A custom provider (`oauthCustomProvider`) should map the same
`{ id, roles?, organizationId? }` shape.

## Dashboards under OAuth

With `app.builder: true`, the dashboard tools scope every call to the caller:

- A caller sees, loads, updates and deletes only dashboards stamped with its
  own id.
- A call that resolves no caller id is refused (`isError`) — with OAuth
  configured, `createFrameworkApp` also refuses calls that reach the tools
  without any `ctx.auth`. Nothing is ever saved owner-less under OAuth.
- An owner-less dashboard is global scope, which belongs to servers without
  OAuth: an identified caller can neither see nor modify it. Records saved
  owner-less under OAuth by toolkit ≤ 2.5 (stock providers map `id`, which
  2.5 did not read) therefore disappear from every list; give them back an
  owner by setting `userId` in the store.
- A record that exists but cannot be read (newer `schemaVersion`, corrupt
  JSON, failed schema) is reported, never treated as absent: `list-dashboards`
  includes it with an `unreadable` reason, and load/save/delete refuse it.

`installToolkit` on your own server gets the same scoping from `ctx.auth`; pass
`requireCallerIdentity: true` to also refuse calls that carry no auth at all.

## Org gate

Enforce that every request comes from a specific organization:

```ts
await createFrameworkApp({
  ...,
  middleware: { orgGate: process.env.WORKOS_ORG_ID },
})
```

`undefined` or missing → pass-through. Enforced by `createOrgGateMiddleware`
comparing the caller's `organizationId` (`resolveCaller`) on every inbound
mcp:\* request. WorkOS, Clerk and Scalekit map it as `organizationId`; a
1.x-era custom provider's `organization_id` is read too. The gate is
fail-closed: a caller without an organization is rejected.

## Role filter

Restrict which modules a role can see and call:

```ts
await createFrameworkApp({
  ...,
  middleware: {
    orgGate: process.env.WORKOS_ORG_ID,
    roleFilter: {
      accountant: ["lexoffice", "orgamax"],
      support: ["dimacon"],
    },
  },
})
```

Rules:

- A role listed as a key **restricts** users with that role to the listed
  modules. Multiple restricted roles → union.
- A user whose roles _don't_ appear as keys is **unrestricted**.
- Tools without an underscore in their name (framework tools, `render-view`)
  always pass.
- Tool → module mapping uses the `<module>_<tool>` prefix.
- Roles come from the provider-mapped `user.roles` (string entries).

Both middlewares return sync pass-throughs when the rule map is empty, so
you can wire them unconditionally.

## Combining

- Put `orgGate` on `mcp:*` (it runs first).
- `roleFilter.toolsList` on `mcp:tools/list`.
- `roleFilter.toolsCall` on `mcp:tools/call`.

`createFrameworkApp` wires this ordering automatically. If you boot the
server yourself, replicate — the helpers are typed to register directly, no
cast:

```ts
server.use("mcp:*", createOrgGateMiddleware(orgId))
const { toolsList, toolsCall } = createRoleFilterMiddleware(rules)
server.use("mcp:tools/list", toolsList)
server.use("mcp:tools/call", toolsCall)
```

## Caveat — server-internal calls

Pipeline steps use the injected `callTool` closure and skip the RPC
surface. `orgGate` doesn't matter (authentication already happened for the
outer `render-view` call), but `roleFilter` also doesn't apply. Step code
is trusted by definition, so this is acceptable — add explicit role checks
inside a step if you need defense-in-depth on that path.

## Source

- `packages/core/src/auth/caller.ts`
- `packages/core/src/middleware/org-gate.ts`
- `packages/core/src/middleware/role-filter.ts`
- `packages/core/src/tools/create-framework-app.ts`
- `packages/core/src/tools/create-framework-app.auth.test.ts` — the contract
  through a real server with a fake OAuth provider

## See also

- [Middleware concept](../concepts/middleware.md)
