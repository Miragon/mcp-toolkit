# Recipe: debugging pipeline steps

## Symptom inventory

When `render-view` returns but a widget shows an error or wrong data,
the cause is almost always one of:

1. The step didn't run (registry miss / missing required keys).
2. The step ran but threw — its error landed in `context.errors`.
3. The step ran but produced the wrong shape — widget reads from
   `context.stepData[stepId].keys` and finds nothing useful.

The framework's `context.errors` array surfaces (1) and (2) with a
human-readable `reason`. Read it first.

## Inspect the raw render-view result

```sh
curl -sX POST http://localhost:3010/mcp \
  -H 'content-type: application/json' \
  -d @- <<'JSON' | jq '.result.structuredContent'
{
  "jsonrpc": "2.0", "id": 1, "method": "tools/call",
  "params": { "name": "render-view",
    "arguments": {
      "keys": { "items-ui:itemId": "1" },
      "steps": [{ "id": "item", "step": "items-ui:resolve-item" }],
      "layout": { "rows": [{ "row": [{ "widget": "items-ui:item-card", "span": 6 }] }] }
    }
  }
}
JSON
```

You'll see `context.errors` and per-step `context.stepData`. If `errors`
is non-empty, you're past the manifest layer — start there.

## Common error reasons + fixes

| `reason`                          | Cause                                                                | Fix                                                                          |
| --------------------------------- | -------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `Step "X" not registered`         | Step ID typo, or the module isn't in `MCP_ACTIVE_MODULES`.           | Check the registry: call `get-framework-manifest`.                           |
| `Missing required keys: foo, bar` | Caller didn't pass the keys; or a previous step didn't produce them. | Inspect `context.keys` after the previous step ran (or pass them in `keys`). |
| `<message from step>`             | Step itself threw.                                                   | Add a `console.error` inside the step or read your server logs.              |

## Step didn't get a typed `callTool`

Symptoms: the step throws `callTool is not a function` or a TypeScript
error at the call site. Two causes:

1. **`proxyBinding` isn't set on the plugin.** `buildProxyAppConfigs`
   only injects `callTool` when `plugin.proxyBinding` is a string.
   Without it the closure is `undefined`.
2. **`proxyBinding` references a proxy that doesn't exist.** The helper
   logs a warning and leaves the appConfig empty. Make sure the proxy
   name appears in `MCP_PROXIES`.

## Step ran but the widget renders empty

Common reasons:

- The step returned `keys: { item: result }` but the widget reads
  `context.keys.itemPayload`. Reconcile the key name.
- The step's `_dataType` doesn't match what a downstream check expects.
  `dataType` is a label — pick deliberate values
  (`"items-ui:item"`, not `"any"`).
- The widget uses `useToolQuery` to fetch its own data and that call
  failed silently. Inspect the iframe's React DevTools or add a
  `console.error` inside the widget.

## userId not propagating

`renderView` reads `ctx.userId` from the inbound auth and threads it
through `executePipeline → bindAppConfig → callTool`. If your step
gets `userId: undefined` for an oauth2 upstream call:

- The MCP request is unauthenticated. `oauth?` was omitted from
  `createFrameworkApp`, or the user hasn't logged in.
- The middleware order is wrong (oauth provider must run before
  org-gate / role-filter / framework tools). `createFrameworkApp` does
  this for you; if you boot the server manually, replicate the order
  shown in [`packages/core/src/tools/create-framework-app.ts`](../../packages/core/src/tools/create-framework-app.ts).

## Add transient logging to the executor

The executor is small enough to read straight through —
[`packages/core/src/engine/pipeline-executor.ts`](../../packages/core/src/engine/pipeline-executor.ts).
For deeper diagnostics, drop a `console.log` inside `bindAppConfig` to
see what `appConfig` and `ctx` each step actually sees.

## See also

- [Pipelines and steps](../concepts/pipelines-and-steps.md)
- [Layout and rendering](../guides/layout-and-rendering.md)
- [Testing with examples](../guides/testing-with-examples.md)
