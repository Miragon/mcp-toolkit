# Run it locally

Boot the same host the [hosted playground](index.md) runs, on your machine:

```sh
pnpm --filter @miragon/mcp-toolkit-examples start:playground
```

That builds the widget bundle and starts the host on `:3020` in dev mode, so
the built-in mcp-use inspector is at `http://localhost:3020/inspector` — take
the [guided tour](tour.md) against it exactly as against the hosted one.

Unlike `dev:host`, `start:playground` deliberately does **not** load
`examples/.env`: the full host's env pulls in the upstream proxies and port
`3010`, which would either crash this host (the upstreams aren't running) or
collide with `dev:host`. Exported env vars still apply.

## What it is

The entry is [`examples/host/playground.ts`](../../examples/host/playground.ts) —
the deployable subset of the examples host: the two self-owned modules
(`tasks`, `orders`) with `builder: true`, no upstreams, so it runs as one
process. It uses the default in-memory dashboard store, so every restart
resets what was saved.

The full examples host with the federation modules (articles, customers) is
[`examples/host/index.ts`](../../examples/host/index.ts) — it needs the two
demo upstreams and is documented in
[examples/README.md](../../examples/README.md).

## Next

Ship your own copy → [Deploy your own](deployment.md).
