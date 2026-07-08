# Deploy your own

The hosted playground runs on Fly.io from
[`deploy/playground/`](../../deploy/playground/) — a Dockerfile, a `fly.toml`,
and an ops README. The same setup deploys any single-process toolkit host, so
it doubles as a worked deployment reference.

## How it deploys

- **CI** — [`.github/workflows/deploy-playground.yml`](../../.github/workflows/deploy-playground.yml)
  redeploys on every push to `main` that touches an image input (`packages/**`,
  `examples/**`, `deploy/playground/**`, and the workspace manifests), so the
  playground tracks the repo. It needs a `FLY_API_TOKEN` repo secret — an
  app-scoped deploy token.
- **By hand** — from the repo root (the Docker build context is the whole
  workspace):

  ```sh
  flyctl deploy --config deploy/playground/fly.toml --ha=false
  ```

## Two things that matter

- **`NODE_ENV=production`** — mcp-use skips mounting the local inspector (its
  routes are unauthenticated — never expose them publicly) and keeps sessions
  in memory. The landing page's "Open in Inspector" button links to the hosted
  inspector instead.
- **Single machine (`--ha=false`)** — all state (task/order stores, MCP
  sessions, saved dashboards) is per-process in-memory, and Fly's proxy has no
  session stickiness. A second HA machine would round-robin requests into a
  process that never saw them. Keep it to one machine.

Full details, including the env-var table, are in the
[deploy README](../../deploy/playground/).
