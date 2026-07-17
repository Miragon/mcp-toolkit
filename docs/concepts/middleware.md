# Middleware

mcp-use middleware sits between the transport and the tool handler. Two
helpers ship in the toolkit; both are pass-through when disabled so callers
can wire them unconditionally and let config decide.

## Org gate

```ts
createOrgGateMiddleware(orgId: string | undefined): OrgGateMiddleware
```

- Register as `server.use("mcp:*", createOrgGateMiddleware(orgId))`.
- Every RPC must come from a token with `user.organization_id === orgId`.
- Tokens without `organization_id` are rejected too (forces org-scoped login).
- `undefined` → pass-through. Useful for single-tenant deployments that
  don't set `WORKOS_ORG_ID`.

Source: `packages/core/src/middleware/org-gate.ts`.

## Role filter

```ts
createRoleFilterMiddleware(roleToModules: Record<string, string[]>): {
  toolsList: RoleFilterMiddleware
  toolsCall: RoleFilterMiddleware
}
```

- Register the pair:
  ```ts
  const { toolsList, toolsCall } = createRoleFilterMiddleware(rules)
  server.use("mcp:tools/list", toolsList)
  server.use("mcp:tools/call", toolsCall)
  ```
- `rules` — `{ roleName: [moduleName, ...] }`. A role listed as a key
  _restricts_ users with that role to the listed modules.
- Users whose roles include _no_ key in the mapping → unrestricted. This
  is deliberate opt-in so adding a new role doesn't silently revoke tools.
- Tool → module mapping uses the prefix convention `<module>_<tool>`. Tools
  without an underscore (framework tools, `render-view`, etc.) are always
  allowed.
- `toolsList` filters `tools/list` output; `toolsCall` blocks a mismatched
  `tools/call` as defence-in-depth.

Source: `packages/core/src/middleware/role-filter.ts`.

## Caveat — server-internal calls bypass middleware

When a pipeline step dispatches through the injected `callTool` closure, the
closure resolves the call in-process and skips the MCP RPC
surface. The role filter _doesn't_ apply. Step code is part of the trusted
server, so the default is acceptable — add explicit role checks inside the
step if a step path must also be gated.

## Wiring via `createFrameworkApp`

```ts
await createFrameworkApp({
  ...,
  middleware: {
    orgGate: process.env.WORKOS_ORG_ID,
    roleFilter: JSON.parse(process.env.ROLE_MODULES ?? "{}"),
  },
})
```

The factory skips each helper when its option is missing or empty — see
`packages/core/src/tools/create-framework-app.ts:68-79`.

## See also

- [middleware-and-auth](../guides/middleware-and-auth.md) — full walkthrough.
