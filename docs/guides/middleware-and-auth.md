# Middleware and auth

Authentication enters through the mcp-use `oauth` provider (WorkOS, etc.);
the toolkit adds two middleware helpers on top for org scoping and
role-based tool filtering.

## Stack

```
MCP transport
    │
    ▼
oauth provider          ← mcp-use, surfaces ctx.auth.user.{userId, organization_id, roles}
    │
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

## Authentication

`createFrameworkApp` accepts an `oauth?: OAuthProvider` option. Example
with WorkOS:

```ts
import { oauthWorkOSProvider } from "mcp-use/server"

await createFrameworkApp({
  ...,
  oauth: oauthWorkOSProvider({ subdomain: process.env.WORKOS_SUBDOMAIN! }),
  ...
})
```

Skip the option for unauthenticated development servers — the framework tools
still work (steps then see `userId: undefined`).

## Org gate

Enforce that every request comes from a specific WorkOS organization:

```ts
await createFrameworkApp({
  ...,
  middleware: { orgGate: process.env.WORKOS_ORG_ID },
})
```

`undefined` or missing → pass-through. Enforced by
`createOrgGateMiddleware` checking `ctx.auth.user.organization_id` on every
inbound mcp:\* request.

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

Both middlewares return sync pass-throughs when the rule map is empty, so
you can wire them unconditionally.

## Combining

- Put `orgGate` on `mcp:*` (it runs first).
- `roleFilter.toolsList` on `mcp:tools/list`.
- `roleFilter.toolsCall` on `mcp:tools/call`.

`createFrameworkApp` wires this ordering automatically. If you boot the
server yourself, replicate:

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

- `packages/core/src/middleware/org-gate.ts`
- `packages/core/src/middleware/role-filter.ts`
- `packages/core/src/tools/create-framework-app.ts:68-79`

## See also

- [Middleware concept](../concepts/middleware.md)
