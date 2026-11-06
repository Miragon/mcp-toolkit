# Migrating from 3.x

Move a project from mcp-toolkit 3.x to 4.0, which raises the Node.js, React and TanStack Query
versions it needs and changes nothing else.

**Requirements:** Node.js 22.18 or later for the CLI; React 19 and TanStack Query 5.100.2 or later
for the React package.

The config, the CLI's commands and flags, the generated code and the APIs of the core and React
packages stay as they are in 3.1. What changes:

| What                                         | 3.x                                            | 4.0                                                                                 |
| -------------------------------------------- | ---------------------------------------------- | ----------------------------------------------------------------------------------- |
| Node.js for the CLI                          | 20 or newer, 22.18 or newer for a `.ts` config | 22.18 or newer: Node.js 20 reached its end of life in April 2026                    |
| `react`, peer of the React package           | `^18.0.0` or `^19.0.0`                         | `^19.0.0`                                                                           |
| `@tanstack/react-query`, peer of the package | `^5.48.0`                                      | `^5.100.2`, the lowest release the package's tests and type tests pass against      |
| The CLI's dependencies                       | exact versions                                 | caret ranges, so your package manager can share them with your project's own copies |

## 1. Update Node.js

Run the CLI on Node.js 22.18 or newer, locally and in CI. With `actions/setup-node`, any
`node-version` from `22` on works. On an older Node.js, npm and pnpm warn about the engines range,
and a `.ts` config fails with `Node.js loads a .ts config from version 22.18 on`.

## 2. Update React

The React package takes React 19 only. Move your app to React 19 first, with React's
[upgrade guide](https://react.dev/blog/2024/04/25/react-19-upgrade-guide), then make sure TanStack
Query is 5.100.2 or newer:

```sh
pnpm add react@19 react-dom@19 @tanstack/react-query@5
pnpm add -D @types/react@19 @types/react-dom@19
```

A project without the React hooks skips this step.

## 3. Install the 4.0 packages

```sh
pnpm add -D @miragon/mcp-toolkit-tool-codegen@4
pnpm add @miragon/mcp-toolkit-tool-codegen-core@4
```

With the React hooks, also:

```sh
pnpm add @miragon/mcp-toolkit-tool-codegen-react@4
```

Keep the three packages on the same minor version, as in 3.x: the generator declares both runtime
packages as optional peers of its own minor version.

## 4. Check the generated files

The generated code is the same as with 3.1. Run the drift check against your server to confirm it:

```sh
pnpm exec mcp-tool-codegen generate --check
```

If it reports a drift, regenerate with `pnpm exec mcp-tool-codegen generate` and review the diff:
the CLI's dependencies are ranges now, and a newer Prettier or json-schema-to-typescript in your
lockfile can format or name a type differently.

## Next steps

- [Getting started](./getting-started.md): the requirements and a first typed call.
- [Guarantees and limits](./guarantees.md): which Node.js, React and TanStack Query versions CI
  tests.
- [Keep generated code in sync](./guides/check-in-ci.md): `generate --check` as the drift gate in
  CI.
