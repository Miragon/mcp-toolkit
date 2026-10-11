# my-mcp-server — minimal @miragon/mcp-toolkit starter

A self-contained MCP server built on the published `@miragon/mcp-toolkit`
packages: a plain [mcp-use](https://mcp-use.com) project with the toolkit
installed on top — one module that registers its **own** tools plus a widget
(the `tasks` module), views built and served by the mcp-use CLI. Two commands
take you from clone to a rendered widget.

## Quickstart

You need Node.js 22.22.2 or newer and [pnpm](https://pnpm.io). The `@miragon`
packages are on the public npm registry, so no authentication is required.

1. **Install:**

   ```sh
   pnpm install
   ```

2. **Run** (`mcp-use dev` — builds the views with HMR, boots the server):

   ```sh
   pnpm dev
   ```

3. **See it work:** the terminal prints the built-in inspector URL
   (`…/mcp/inspector`). Open it and call `show_tasks_board` — the task-board
   widget renders. That is the full loop: an MCP tool returning a rendered UI.
   Edit `views/shared/TaskListCard.tsx` and the view hot-reloads.

## Dev loop

- `pnpm dev` — `mcp-use dev`: server + views with HMR + the built-in
  inspector. This is the whole loop; no bundle step, no restart after widget
  edits.
- `pnpm build` / `pnpm start` — `mcp-use build` (server + views into
  `.mcp-use/build`) and `mcp-use start` (serve the production build).
- `pnpm typecheck` — `tsc --noEmit`.

Optional config lives in `.env` (`PORT`; `MCP_URL` only for deployed servers)
— copy the template first:

```sh
cp env.example .env
```

## Project layout

```
├── package.json                   # pinned versions; main: src/index.ts (the CLI reads it)
├── .npmrc                         # save-exact: pin dependency versions
├── env.example                    # PORT / MCP_URL — copy to .env
├── src/
│   ├── index.ts                   # default-exported MCPServer + installToolkit(...)
│   └── modules/tasks/
│       ├── definition.ts          # static contract: module name + widget ids
│       ├── tool-names.ts          # tool-name constants (server ↔ views agree here)
│       ├── store.ts               # in-memory domain layer; TasksBoardData view-model
│       └── plugin.ts              # tools: list_tasks, create_task, show_tasks_board, tasks_board_data
└── views/                         # CLI convention: one dir per view-bound tool
    ├── render-view/view.tsx       # the toolkit composer view
    ├── show_tasks_board/view.tsx  # the tasks widget tool's view
    └── shared/                    # shared browser modules — MUST live under views/
        ├── widgets.tsx            # widget-id map → React components
        ├── TaskListCard.tsx       # the widget: {data: TasksBoardData} → UI primitives
        ├── messages.ts            # the widget's words: typed en/de catalog
        └── styles.css             # Tailwind entry: globals.css + fonts.css + @source scan paths
```

## How the views work

Every model-visible widget tool is bound to a **view** named after the tool
(`view: { name: "show_tasks_board" }` in `plugin.ts`); `installToolkit` binds
`render-view` the same way. The mcp-use CLI discovers each
`views/<name>/view.tsx` by convention, builds it, serves it as the MCP
resource `ui://views/<name>.html`, and emits the `_meta.ui` wire keys — no
bundle wiring in this project at all.

Each view renders the same `McpToolkitApp` with the shared widget map:

- Every widget is registered **twice**: once in the plugin's `definition.ts`
  (the id + the `consumes` dataType the server pushes) and once in
  `views/shared/widgets.tsx` (the id + the component). The two sides meet on
  the widget id — `"tasks:board"` here.
- `adaptDataWidget(TaskListCard, "tasks:board")` resolves the step whose
  `_dataType` is `"tasks:board"` (set by `buildSingleWidgetView` in
  `show_tasks_board`) and forwards its data to the component's `data` prop.

**Shared browser modules live under `views/` on purpose** (`views/shared/`):
the CLI dev server routes only `views/*` through its Vite middleware, so a
browser module anywhere else in the project 404s in dev. Server-side code
(`src/`) is unaffected — it runs in Node. Type-only imports from `src/` into
a view are fine; they are erased at build time.

Styling: `views/shared/styles.css` imports the toolkit's
`@miragon/mcp-toolkit-ui/globals.css` (Tailwind theme + tokens) and adds
`@source` lines so Tailwind generates classes used outside the CSS file's own
tree. If a class "does nothing" in the rendered widget, check that the file
using it is covered by an `@source` line. `tailwindcss` is a dev dependency
because `@miragon/mcp-toolkit-ui` declares it as a peer; the Vite plugin that
compiles it ships inside the mcp-use CLI, so this project needs no Vite
dependency or config of its own.

Version pinning: `mcp-use` here must be exactly the version the pinned
`@miragon` packages name as their peer (a second copy breaks the widgets' host
context); `react`, `react-dom` and `zod` only have to satisfy the peer ranges
(see the packages' `peerDependencies`). Keep them in step when bumping either
side. `lucide-react` is pinned to the
exact version `@miragon/mcp-toolkit-ui` depends on, on purpose: a second copy
in the graph splits mcp-use into two peer instances and crashes widgets at
render time (see the toolkit's migration guide), and your own icons then miss
the stroke the toolkit sets for its views.

Between toolkit releases the `@miragon` pins here still point at the previous
release, so `pnpm install` can report an unmet `mcp-use` peer until the next
release lifts them. It is a warning, not a break — install, typecheck and
`mcp-use build` all succeed.

## Look and language

- **Look.** The widgets render in the Miragon design system, the toolkit's
  default theme, light or dark as the host is. To give them your brand,
  override **role variables** only (`--primary`, `--primary-hover`, `--link`,
  `--focus`, `--radius-md`, …) in `views/shared/styles.css`: the commented
  block there has the light and the dark selectors. Never override the
  `--cd-*` tokens or component classes. The
  [white-labeling guide](https://github.com/Miragon/mcp-toolkit/blob/main/docs/guides/white-labeling.md)
  lists every role.
- **Fonts.** The theme names Geist and Geist Mono first and falls back to the
  host's font. `views/shared/styles.css` loads both through the `fonts.css`
  import: the files come from npm through the bundler, no font CDN. The view
  build inlines them into every view; to keep views small, drop the import
  and serve the files by URL with `fontFaces({ baseUrl })` (allow that origin
  in the view's CSP `resourceDomains`), or let the host's font stand in.
- **Language.** The toolkit's own text (list footers, empty and error states,
  toasts, the view toolbar) follows the host's locale, in English or German,
  and so does `TaskListCard`: every word comes from the typed en/de catalog in
  `views/shared/messages.ts` (German with du), picked by `useLocale()`. Each
  `views/<tool>/view.tsx` hands the host's locale to a `LocaleProvider`. Add
  a widget's words to the catalog, never into the component, and format
  counts and dates with `useLocale()`.

## CI

The included CI (`.github/workflows/ci.yml`) typechecks and runs
`mcp-use build`. The `@miragon` packages are public on npm, so it installs
them with no token or registry configuration.

## Where this project comes from

This project is maintained as
[`templates/minimal-server`](https://github.com/Miragon/mcp-toolkit/tree/main/templates/minimal-server)
in the `mcp-toolkit` monorepo and auto-mirrored to
[`Miragon/mcp-toolkit-starter`](https://github.com/Miragon/mcp-toolkit-starter),
the "Use this template" repo. Nothing in it depends on the monorepo — it
installs only published packages. If you run it in place inside the monorepo
checkout, install with `pnpm install --ignore-workspace` (the directory sits
inside the monorepo's pnpm workspace but is not part of it).

## Where to go next

- [Docs](https://github.com/Miragon/mcp-toolkit/tree/main/docs) — concepts,
  guides, and the API reference for every package; the
  [migration guide](https://github.com/Miragon/mcp-toolkit/blob/main/docs/guides/migrating-to-mcp-use-2.md)
  if you are coming from a 0.10.x scaffold.
- [The `standalone-host` example](https://github.com/Miragon/mcp-toolkit/tree/main/examples/standalone-host)
  — the in-repo reference for this exact shape.
- [The `tasks` example](https://github.com/Miragon/mcp-toolkit/tree/main/examples/modules/tasks)
  — the full-size version of this module (complete_task, filterable board
  widget, in-widget refresh, tests).
- [Agent skills](https://github.com/Miragon/mcp-toolkit/tree/main/.claude/skills)
  — the repo's coding-agent skills (`build-mcp-server`, `add-mcp-tool`,
  `build-mcp-widget`, `compose-a-view`, `white-label-client`) encode the house
  patterns; copy them into this project's `.claude/skills/` so your coding
  agent builds on them.
