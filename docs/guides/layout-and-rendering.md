# Layout and rendering

`render-view` is the tool the LLM calls to build a UI. It runs a pipeline
to resolve keys, then returns a payload the widget bundle can render
alongside an MCP UI resource.

## Input schema

```jsonc
{
  "keys":  { "<key>": <value> },           // initial context keys
  "steps": [                                // optional pipeline
    { "id": "<ctxKey>", "step": "<step-id>", "optional": false }
  ],
  "layout": <layout>,                       // see below
  "title": "<optional string>"
}
```

See `packages/core/src/tools/register-framework-tools.ts` for the exact Zod
schema.

## Layout shapes

Three accepted forms:

**Flat rows**

```jsonc
[{ "row": [{ "widget": "hello:greeting-card", "span": 6 }] }]
```

**Explicit wrapper**

```jsonc
{
  "rows": [{ "row": [{ "widget": "items-ui:item-card", "span": 6 }] }],
}
```

**Tabs**

```jsonc
{
  "tabs": [
    { "label": "Overview", "rows": [{ "row": [{ "widget": "..." }] }] },
    { "label": "Details", "rows": [{ "row": [{ "widget": "..." }] }] },
  ],
}
```

`span` is 1–12 (12-column grid). Missing → widget's declared size decides.

Schema source: `packages/core/src/framework/layout-schemas.ts`.

## Output payload

```ts
{
  content: [{ type: "text", text: "<summary>" }],
  structuredContent: {
    _refreshParams: { keys, steps, layout, title },
    title,
    context: {
      keys:     Record<string, unknown>,
      stepIds:  string[],
      stepData: Record<stepId, { data, keys, _app, _dataType }>,
      errors:   { stepId, reason }[],
    },
    layout: LayoutConfig,
  },
}
```

The widget bundle reads `context.keys` to feed each widget's
`WidgetProps.keys`. `stepData` is available through `WidgetProps.context`
for widgets that need the raw step result.

## Refresh

The framework registers a second tool (`refresh-view` by default — override
via `app.refreshToolName`) that accepts the same schema. The UI stores
`_refreshParams` from the initial `render-view` response and calls
`refresh-view` to re-run the pipeline without the LLM in the loop.

## Running a layout end-to-end

YAML input:

```yaml
# items-layout.yaml
rows:
  - row:
      - widget: items-ui:item-card
        span: 6
```

Tool call:

```sh
curl -sX POST http://localhost:3010/mcp \
  -H 'content-type: application/json' \
  -d @- <<'JSON' | jq
{
  "jsonrpc":"2.0","id":1,"method":"tools/call",
  "params":{
    "name":"render-view",
    "arguments":{
      "keys":{"items-ui:itemId":"1"},
      "steps":[{"id":"item","step":"items-ui:resolve-item"}],
      "layout":{"rows":[{"row":[{"widget":"items-ui:item-card","span":6}]}]}
    }
  }
}
JSON
```

See [`examples/layouts/`](../../examples/layouts/) for runnable shapes.

## See also

- [Widgets](../concepts/widgets.md)
- [Pipelines and steps](../concepts/pipelines-and-steps.md)
- [Testing with examples](testing-with-examples.md)
