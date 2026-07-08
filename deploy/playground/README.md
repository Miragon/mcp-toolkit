# Playground deployment

Fly.io deployment of the public playground —
<https://mcp-toolkit-playground.fly.dev/mcp>. The server is
[`examples/host/playground.ts`](../../examples/host/playground.ts) (the
`tasks` + `orders` modules with `builder: true`, no upstreams); the guided
tour through it is [`docs/playground.md`](../../docs/playground.md).

## How it deploys

- **CI** — [`.github/workflows/deploy-playground.yml`](../../.github/workflows/deploy-playground.yml)
  redeploys on every push to `main` that touches `packages/**`, `examples/**`,
  or this directory, so the playground tracks the repo. Needs the
  `FLY_API_TOKEN` repo secret (a deploy token:
  `flyctl tokens create deploy -a mcp-toolkit-playground`).
- **By hand** — from the **repo root** (the Docker build context is the whole
  workspace):

  ```sh
  flyctl deploy --config deploy/playground/fly.toml --ha=false
  ```

  `--ha=false` matters on a fresh app: everything is per-process in-memory
  (see below), so the app must stay a **single machine** — Fly's default HA
  pair would round-robin MCP sessions into a process that has never seen
  them. On an existing single-machine app the flag is a harmless no-op.

## Deliberate properties

- `NODE_ENV=production` — mcp-use skips mounting the local inspector (its
  routes are unauthenticated; never expose them publicly) and uses in-memory
  sessions (no disk writes). The landing page's "Open in Inspector" button
  links to the hosted inspector instead.
- `HOST=0.0.0.0` — mcp-use binds localhost by default; Fly needs the bind on
  all interfaces. Read by `MCPServer.listen()`, no code involved.
- **Everything is ephemeral** — task/order stores, sessions, and saved
  dashboards are in-memory; `auto_stop_machines` resets the machine when idle.
  A public scratchpad that cleans itself.

## Config

| Env        | Value in `fly.toml`                      | Why                              |
| ---------- | ---------------------------------------- | -------------------------------- |
| `PORT`     | `8080`                                   | matches `internal_port`          |
| `HOST`     | `0.0.0.0`                                | bind beyond localhost            |
| `MCP_URL`  | `https://mcp-toolkit-playground.fly.dev` | advertised base URL (`baseUrl`)  |
| `NODE_ENV` | `production`                             | no inspector, in-memory sessions |
