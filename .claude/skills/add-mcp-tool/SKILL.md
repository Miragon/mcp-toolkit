---
name: add-mcp-tool
description: >-
  Add a tool to an existing @miragon/mcp-toolkit MCP module. Use when asked to
  "add a tool", "expose X as a tool", "register a new MCP tool", write a new
  createToolRegistrar entry, set tool annotations (readOnly/idempotent/destructive
  hints), add an outputSchema, paginate a list tool, or add an app-only *_data feed
  (visibility: "app") for a widget. For a whole new server/module use build-mcp-server;
  for the UI use build-mcp-widget.
---

# Add a tool to a toolkit MCP module

A tool is one `register({...})` call on the module's `createToolRegistrar`. The
registrar builds the Zod schema, advertises the `outputSchema` + `annotations`,
**wraps the handler in `withToolErrors` for you**, and mirrors the return value
into `structuredContent`. Worked reference:
[`examples/modules/tasks/plugin.ts`](../../../examples/modules/tasks/plugin.ts).

## The anatomy of one tool

```ts
import { z } from "zod"
import { createToolRegistrar } from "@miragon/mcp-toolkit-core/tools"

// `register` already exists in the module's registerTools(server, client) function:
//   const register = createToolRegistrar<MyClient>(server, client)

register({
  name: "complete_task", // snake_case verb_noun; unique within the server
  description:
    "Mark a task as done by its id. Idempotent: completing an already-done task is a no-op. Returns the updated task.",
  // Annotations are the model's hint about side effects — get them right:
  annotations: {
    readOnlyHint: false, // it mutates state
    idempotentHint: true, // re-running with the same id yields the same state
    destructiveHint: false, // flipping a status is not a removal
    openWorldHint: false, // data is local to this server (a closed world)
  },
  inputSchema: {
    // .describe() EVERY field — it is the only doc the model sees for the argument.
    taskId: z.string().describe("Id of the task to complete (as returned by list_tasks)."),
  },
  outputSchema: taskSchema, // a z.object; advertised + mirrored into structuredContent
  handler: (client, args) => {
    // Args are loosely typed (post-Zod Record). Narrow to this tool's shape.
    const { taskId } = args as { taskId: string }
    return Promise.resolve(client.complete(taskId)) // throw on bad input — withToolErrors formats it
  },
})
```

## Rules that matter

- **`.describe()` every input field.** It is the model-facing documentation. A
  field without a description is a tool the model will misuse.
- **Annotations encode the contract.** Pick from this table; default each to the
  honest answer, don't leave them off:

  | tool kind                   | `readOnlyHint` | `idempotentHint` | `destructiveHint` |
  | --------------------------- | -------------- | ---------------- | ----------------- |
  | pure read (repeatable)      | `true`         | `true`           | —                 |
  | create / append (each adds) | `false`        | `false`          | `false`           |
  | update / no-op on re-run    | `false`        | `true`           | `false`           |
  | delete / overwrite          | `false`        | `false`          | `true`            |

  Set `openWorldHint: false` when the data is local to your server; `true` when
  the tool reaches an external/unbounded system.

- **`outputSchema` is the structured contract.** Pass a `z.object(...)` (or a
  `z.array(...)`, which auto-wraps to `{ data: [...] }` because MCP requires
  `structuredContent` to be an object). Widgets and `parseToolResult` decode this,
  not your text — so keep it the real shape.
- **Don't wrap the handler yourself.** `createToolRegistrar` already wraps it in
  `withToolErrors`; just `throw new Error("…")` on bad input and it becomes a clean
  tool error. (Only raw `server.tool(...)` calls wrap with `withToolErrors`
  explicitly — see the widget tool / feed in `plugin.ts`.)
- **Keep handlers thin.** Put real logic in a pure, Vitest-tested store/repo (see
  [`store.ts`](../../../examples/modules/tasks/store.ts)) and call it from the handler.

## Paginating a list tool

A bare `z.array(...)` auto-wraps to `{ data: [...] }` — fine for small,
fully-returned lists. When a result is paged, **return an explicit envelope** so
the page metadata travels with the items instead of being lost:

```ts
outputSchema: z.object({
  items: z.array(taskSchema),
  total: z.number().int().describe("Total matching rows across all pages."),
  page: z.number().int().describe("0-based page index returned."),
  pageSize: z.number().int().describe("Max rows per page."),
}),
inputSchema: {
  page: z.number().int().min(0).default(0).describe("0-based page index."),
  pageSize: z.number().int().min(1).max(100).default(20).describe("Rows per page (1–100)."),
},
```

The widget then renders `result.items` and uses `total` for its `ListFooter`.

## App-only data feed (for a widget refresh)

When a widget needs to self-refresh, add a no-UI JSON feed alongside the `show_*`
tool. Use a raw `server.tool(...)` (so you control the result shape), mark it
`visibility: "app"`, and mirror the payload into both channels:

```ts
import { withToolErrors } from "@miragon/mcp-toolkit-core/tools"

server.tool(
  {
    name: "tasks_board_data",
    description: "Internal JSON feed (no UI) backing the board's refresh. Prefer show_tasks_board.",
    annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
    inputSchema: z.object({}),
    visibility: "app", // hidden from the LLM tool surface, still callable from the widget
  },
  withToolErrors(() =>
    Promise.resolve({
      content: [{ type: "text" as const, text: JSON.stringify(data) }],
      structuredContent: data as unknown as Record<string, unknown>,
    }),
  ),
)
```

## Verify

```sh
# unit-test any pure logic you added (repo test policy), then the gates:
pnpm -r build && pnpm -r typecheck && pnpm -r test && pnpm -r lint
```

Confirm the tool shows up and round-trips:

```sh
curl -sX POST http://localhost:3010/mcp -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | jq '.result.tools[].name'
```

## Checklist

- [ ] Unique `name`, model-readable `description`, `.describe()` on every input field.
- [ ] `annotations` match the side-effect reality (read/write/idempotent/destructive).
- [ ] `outputSchema` is the real shape (object, or array → `{ data }`); paged lists use an envelope.
- [ ] Logic lives in a tested store/repo; the handler is thin and throws on bad input.
- [ ] If a widget consumes it, the matching app-only `*_data` feed exists; gates green.
