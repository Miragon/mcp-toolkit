# Playground image — built from the REPO ROOT as context:
#
#   docker build -f deploy/playground/Dockerfile .
#   flyctl deploy --config deploy/playground/fly.toml   # (run from the repo root)
#
# Single stage on purpose: the examples workspace has no compiled output — it
# runs through tsx, which is a devDependency, so pruning to prod deps would
# break the runtime. The `prepare` scripts of the workspace packages build
# their dist/ during `pnpm install`.
FROM node:26-slim

ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable
WORKDIR /repo

# The full workspace graph: pnpm needs every workspace package.json present
# for --frozen-lockfile, so docs (not a dependency) contributes its manifest.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY docs/package.json docs/package.json
COPY packages packages
COPY examples examples

# Install examples + its workspace deps; `prepare` builds the package dists.
RUN pnpm install --frozen-lockfile --filter "@miragon/mcp-toolkit-examples..."

# The single-file widget bundle the host serves as the mcp-app.html resource.
RUN pnpm --filter @miragon/mcp-toolkit-examples build:bundle

# NODE_ENV=production: in-memory sessions (no .mcp-use writes) and no local
# inspector — the landing page links to the hosted one instead.
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=8080
EXPOSE 8080

WORKDIR /repo/examples
CMD ["pnpm", "exec", "tsx", "host/playground.ts"]
