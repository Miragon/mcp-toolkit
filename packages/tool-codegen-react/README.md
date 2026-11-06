# @miragon/mcp-toolkit-tool-codegen-react

React hooks for typed MCP tool calls, the runtime of the `hooks.tsx` that
[`@miragon/mcp-toolkit-tool-codegen`](https://www.npmjs.com/package/@miragon/mcp-toolkit-tool-codegen)
generates with `react: true`. `ToolCallerProvider` supplies the function the hooks call tools
with; `useToolQuery` and `useToolMutation` run each call as a TanStack Query query or mutation:
cached, deduplicated, cancellable, typed by the generated tool map. A tool annotated
`readOnlyHint: true` gets a query hook, every other tool a mutation hook that invalidates the
server's queries on success.

## Install

```sh
pnpm add @miragon/mcp-toolkit-tool-codegen-react @miragon/mcp-toolkit-tool-codegen-core @tanstack/react-query
```

## Usage

Inside your app's `QueryClientProvider`, hand `ToolCallerProvider` a `ToolCaller` from the core
package, `null` while the client connects:

```tsx
import type { ToolCaller } from "@miragon/mcp-toolkit-tool-codegen-core"
import { ToolCallerProvider } from "@miragon/mcp-toolkit-tool-codegen-react"
import { useTasksListTasksQuery } from "./generated/hooks.js"

export const Tasks = ({ callTool }: { callTool: ToolCaller | null }) => (
  <ToolCallerProvider callTool={callTool}>
    <OpenTasks />
  </ToolCallerProvider>
)

function OpenTasks() {
  const list = useTasksListTasksQuery({ done: false }) // waits until the provider has a caller
  if (list.isError) return <p>{list.error.message}</p>
  return <p>{list.isSuccess ? `${list.data.tasks.length} open tasks` : "Loading tasks"}</p>
}
```

## Requirements

- Peers: `react` `^18 || ^19` (the tests run on React 19), `@tanstack/react-query` `^5.48` and
  `@miragon/mcp-toolkit-tool-codegen-core` of the same minor version as this package.
- A `QueryClientProvider` above the hooks, which your app renders: this package creates no
  `QueryClient`.
- ESM only.

## Documentation

- [Use the React hooks](https://miragon.github.io/mcp-toolkit/guides/react-hooks): mutations,
  invalidation, the cache, suspense, several servers and MCP Apps widgets.
- [React API](https://miragon.github.io/mcp-toolkit/reference/react): every export, its options
  and errors.
- [Generated code](https://miragon.github.io/mcp-toolkit/reference/generated-code#hookstsx): the
  hook names and signatures in `hooks.tsx`.
