# Recipe: role-based module access

## Goal

Restrict which modules a user can see and call based on the roles
attached to their JWT. An accountant sees `lexoffice` and `orgamax`; a
support agent sees `dimacon`; an admin sees everything.

## How filtering works

The role-filter middleware splits each tool name on the first underscore
into `<module>_<tool>`. The `<module>` segment is matched against the
configured rule map.

- A role listed as a key **restricts** users with that role to the
  listed modules. Multiple restricted roles → union.
- A user whose roles _don't_ appear as keys is **unrestricted**.
- Tools without an underscore (`render-view`, `get-framework-manifest`,
  `refresh-view`) always pass — they're framework infrastructure.

Source: [`packages/core/src/middleware/role-filter.ts`](../../packages/core/src/middleware/role-filter.ts).

## Step 1 — author the rule map

A plain JSON object. Keep it in env so non-code stakeholders can tweak it.

```sh
MCP_ROLE_MODULES='{
  "accountant": ["lexoffice", "orgamax"],
  "support":    ["dimacon"],
  "viewer":     []
}'
```

`viewer` here is restricted to nothing — they get only framework tools.
Omit a role from the map entirely to leave it unrestricted (admins).

## Step 2 — wire the env into the framework app

```ts
await createFrameworkApp({
  ...,
  middleware: {
    orgGate: process.env.WORKOS_ORG_ID,
    roleFilter: JSON.parse(process.env.MCP_ROLE_MODULES ?? "{}"),
  },
})
```

`createFrameworkApp` registers `toolsList` on `mcp:tools/list` and
`toolsCall` on `mcp:tools/call` automatically. Empty map → both
middlewares short-circuit to pass-through.

## Step 3 — verify

With `accountant` role, `tools/list` now shows only
`lexoffice_*` + `orgamax_*` + framework tools. Calling
`dimacon_create-job` returns the standard MCP error:

```
Tool "dimacon_create-job" is not allowed for your role.
```

## Caveats

- **Step dispatch bypasses the filter.** Pipeline steps use the injected
  `callTool` closure (not the public RPC), so role-filter doesn't apply
  to internal cross-module calls. Step code is trusted by definition;
  if you need defense-in-depth on the internal path, add an explicit
  role check inside the step.
- **Module name must exactly match the proxy / module name** — the
  middleware uses `tool.split("_")[0]`, so `lexoffice_create-invoice`
  maps to module `"lexoffice"`. UI-only modules with a `<name>-ui`
  directory still register tools under their `definition.name`, so use
  the registry name, not the directory.
- **Roles are read from `ctx.auth.user.roles`** as exposed by
  `mcp-use/server`'s OAuth provider. If your provider emits roles under
  a different claim, write a small adapter that copies them into the
  expected location in a custom middleware mounted before role-filter.

## Combining with org-gate

```ts
middleware: {
  orgGate: process.env.WORKOS_ORG_ID,
  roleFilter: { accountant: ["lexoffice"] },
}
```

`orgGate` runs on `mcp:*` (every inbound request); `roleFilter` then
gates which tools a user inside the org can list/call. Order is
guaranteed by `createFrameworkApp`.

## See also

- [Middleware and auth](../guides/middleware-and-auth.md)
- [Middleware concept](../concepts/middleware.md)
