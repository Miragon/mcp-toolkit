# my-mcp-server — minimal @miragon/mcp-toolkit starter

A self-contained starter for an MCP server built on the published
`@miragon/mcp-toolkit` packages: one host (`createFrameworkApp`), one module
that registers its **own** tools plus a widget (the `tasks` module), and the
Vite setup that builds the widget bundle into a single `mcp-app.html`.
Nothing in here depends on the monorepo.

Two ways to start:

- **Use the template repo** — [`Miragon/mcp-toolkit-starter`](https://github.com/Miragon/mcp-toolkit-starter)
  mirrors this directory. Click "Use this template" (or
  `gh repo create my-mcp-server --template Miragon/mcp-toolkit-starter`) and
  you have a fresh repo with CI included.
- **Copy this directory** out of the `mcp-toolkit` repo and rename it.

The included CI (`.github/workflows/ci.yml`) typechecks and builds the widget
bundle. It installs from the restricted `@miragon` scope: repos in the Miragon
org can use the built-in workflow token once the packages grant them read
access; anywhere else, add a `PACKAGES_READ_TOKEN` repo secret (a PAT with
`read:packages`).

## Prerequisites

- Node.js 20 or newer, and [pnpm](https://pnpm.io).
- A GitHub [personal access token](https://github.com/settings/tokens) with
  the `read:packages` scope, exported as `GITHUB_TOKEN`. The packages live on
  GitHub Packages under the restricted `@miragon` scope; the `.npmrc` in this
  directory is already wired to it.

```sh
export GITHUB_TOKEN=ghp_…
```

## Run it

```sh
pnpm install
pnpm start          # builds the widget bundle, then boots the host
```

Then open <http://localhost:3010/inspector> (the Inspector is built into
mcp-use) and call `show_tasks_board`. That is the full loop: an MCP tool
returning a rendered widget.

Optional config lives in `.env` (copy `env.example` first):

```sh
cp env.example .env
```

## Project layout

```
├── package.json                   # pinned versions; dev / build:bundle / start / typecheck
├── .npmrc                         # @miragon scope → GitHub Packages
├── env.example                    # PORT / MCP_URL — copy to .env
├── src/
│   ├── host.ts                    # createFrameworkApp: plugins, proxies, app bundle
│   └── modules/tasks/
│       ├── definition.ts          # static contract: module name + widget ids
│       ├── tool-names.ts          # tool-name constants (server ↔ widget agree here)
│       ├── store.ts               # in-memory domain layer; TasksBoardData view-model
│       ├── plugin.ts              # tools: list_tasks, create_task, show_tasks_board, tasks_board_data
│       └── widgets/TaskListCard.tsx  # the widget: {data: TasksBoardData} → UI primitives
└── app-bundle/
    ├── index.html                 # bundle entry + React importmap shim
    ├── main.tsx                   # widget-id map → React components (McpToolkitApp)
    ├── main.css                   # Tailwind entry: globals.css + @source scan paths
    ├── vite.config.ts             # single-file build → app-bundle/dist/index.html
    └── vite-env.d.ts
```

## How the widget bundle works

The host serves one HTML file — `mcp-app.html` — as an MCP resource
(`app.resourceUri` in `src/host.ts`). MCP clients render it in an iframe fed
from the resource content, so there is no second HTTP request for chunks:
the bundle must be a **single self-contained file**. That is what
`app-bundle/vite.config.ts` produces (`vite-plugin-singlefile`, everything
inlined) into `app-bundle/dist/index.html`, which `htmlPath` points at.

Inside the bundle, `app-bundle/main.tsx` maps widget ids to React components:

- Every widget is registered **twice**: once in the plugin's `definition.ts`
  (the id + the `consumes` dataType the server pushes) and once in the bundle's
  widget map (the id + the component). The two sides meet on the widget id —
  `"tasks:board"` here.
- `adaptDataWidget(TaskListCard, "tasks:board")` resolves the step whose
  `_dataType` is `"tasks:board"` (set by `buildSingleWidgetView` in
  `show_tasks_board`) and forwards its data to the component's `data` prop.

The bundle is a build artifact: after changing a widget or the map, rebuild it
(`pnpm build:bundle`) and restart — the host reads the file at
`app-bundle/dist/index.html`. `pnpm start` chains both.

Styling: `app-bundle/main.css` imports the toolkit's
`@miragon/mcp-toolkit-ui/globals.css` (Tailwind theme + tokens) and adds two
`@source` lines so Tailwind generates classes used outside the CSS file's own
tree — your widgets under `src/`, and the UI package's shipped sources in
`node_modules`. If a class "does nothing" in the rendered widget, check that
the file using it is covered by an `@source` line.

## Where to go next

- [Docs](https://github.com/Miragon/mcp-toolkit/tree/main/docs) — concepts,
  guides, and the API reference for every package.
- [The `tasks` example](https://github.com/Miragon/mcp-toolkit/tree/main/examples/modules/tasks)
  — the full-size version of this module (complete_task, filterable board
  widget, in-widget refresh, tests).
- [Agent skills](https://github.com/Miragon/mcp-toolkit/tree/main/.claude/skills)
  — the repo's coding-agent skills (`build-mcp-server`, `add-mcp-tool`,
  `build-mcp-widget`, `compose-a-view`, `white-label-client`) encode the house
  patterns; copy them into this project's `.claude/skills/` so your coding
  agent builds on them.
