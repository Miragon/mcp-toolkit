# Changelog

All notable changes to this project will be documented in this file.

This changelog is generated from the conventional-commit history that preceded
release-please. Future entries are written by release-please on tagged releases.

## [0.4.0](https://github.com/Miragon/mcp-toolkit/compare/v0.3.1...v0.4.0) (2026-06-11)


### ⚠ BREAKING CHANGES

* `parseToolResult` (and therefore `useToolQuery`/`useToolMutation`) now reads `structuredContent` before the text channel. Tools that return BOTH a text summary and `structuredContent` previously yielded the parsed text and now yield the structured payload. Pass `{ prefer: "text" }` to restore the old order.

### Features

* mcp-toolkit — upstreaming, security & repo hardening + prompt-ready UI foundation ([#52](https://github.com/Miragon/mcp-toolkit/issues/52)) ([cae4a4a](https://github.com/Miragon/mcp-toolkit/commit/cae4a4a2bd17a7a9be836a541f5bccfa62b1eebb))


### Bug Fixes

* **ci:** use root-as-primary release-please config ([#44](https://github.com/Miragon/mcp-toolkit/issues/44)) ([5185f88](https://github.com/Miragon/mcp-toolkit/commit/5185f88e08f0e5e929a128609d4796b06234f32e))
* **core:** surface dashboard bundles in content text, not just structuredContent ([#42](https://github.com/Miragon/mcp-toolkit/issues/42)) ([becb952](https://github.com/Miragon/mcp-toolkit/commit/becb9526afb9ae9ea1da24794807f032f279ac19))

## [0.3.1](https://github.com/Miragon/mcp-toolkit/compare/v0.3.0...v0.3.1) (2026-05-21)


### Miscellaneous Chores

* **release:** bump all packages to 0.3.1 ([#41](https://github.com/Miragon/mcp-toolkit/pull/41))


### Build System

* **deps:** bump 21 npm-dependencies group updates ([#40](https://github.com/Miragon/mcp-toolkit/pull/40))

## [0.3.0](https://github.com/Miragon/mcp-toolkit/compare/v0.2.1...v0.3.0) (2026-05-21)


### Code Refactoring

* **core:** framework review pass ([#38](https://github.com/Miragon/mcp-toolkit/pull/38))


### Miscellaneous Chores

* **release:** align all packages to 0.3.0 ([#39](https://github.com/Miragon/mcp-toolkit/pull/39))

## [0.2.1](https://github.com/Miragon/mcp-toolkit/compare/v0.2.0...v0.2.1) (2026-05-12)


### Miscellaneous Chores

* **deps:** bump mcp-use 1.26.0 -> 1.27.1 ([#34](https://github.com/Miragon/mcp-toolkit/pull/34))

## [0.2.0](https://github.com/Miragon/mcp-toolkit/compare/v0.1.0...v0.2.0) (2026-05-12)


### Features

* **core:** expose `outputSchema` and emit `structuredContent` ([#33](https://github.com/Miragon/mcp-toolkit/pull/33))


### Build System

* **deps:** bump `pnpm/action-setup` ([#19](https://github.com/Miragon/mcp-toolkit/pull/19))

## 0.1.0 (2026-05-07)


### Features

* initial `mcp-toolkit` extraction (848f0cf)
* **core:** add upstream proxy primitives ([#16](https://github.com/Miragon/mcp-toolkit/pull/16))
* **core:** REST starter for wrapping REST upstreams as MCP tools ([#18](https://github.com/Miragon/mcp-toolkit/pull/18))
* **core:** widget `consumes`/`description`, step `optionalKeys` for LLM discoverability ([#27](https://github.com/Miragon/mcp-toolkit/pull/27))
* UI-only modules + `createFrameworkApp` factory + `tool-codegen` ([#20](https://github.com/Miragon/mcp-toolkit/pull/20))
* interactive view builder + persisted dashboards ([#21](https://github.com/Miragon/mcp-toolkit/pull/21))
* per-cell widget props for builder layouts ([#26](https://github.com/Miragon/mcp-toolkit/pull/26))


### Bug Fixes

* **ui:** ship `src/` in git dep so Tailwind can scan source files (75a8e90)
* **ci:** fix main build + add dependabot + pin npm versions ([#1](https://github.com/Miragon/mcp-toolkit/pull/1))
* **ci:** pin pnpm v10 for `action-setup@v6` compatibility ([#4](https://github.com/Miragon/mcp-toolkit/pull/4))
* **ci:** revert pnpm `action-setup` to v5 ([#6](https://github.com/Miragon/mcp-toolkit/pull/6))
* **proxy:** send `tools/list_changed` via public `mcp-use` API ([#17](https://github.com/Miragon/mcp-toolkit/pull/17))
* **proxy:** OAuth TTL expiry and nonce cookie binding ([#25](https://github.com/Miragon/mcp-toolkit/pull/25))


### Code Refactoring

* **tooling:** Phase 1 — ESLint, Prettier, Husky, CI quality job ([#7](https://github.com/Miragon/mcp-toolkit/pull/7))
* **skills:** move `create-ticket` skill from `.agent` to `.claude` ([#15](https://github.com/Miragon/mcp-toolkit/pull/15))


### Documentation

* refresh stale references + add VitePress site ([#30](https://github.com/Miragon/mcp-toolkit/pull/30))


### Tests

* pin stable contracts + testing policy guardrail ([#24](https://github.com/Miragon/mcp-toolkit/pull/24))


### Continuous Integration

* **quality:** enforce pinned npm dependencies in CI ([#22](https://github.com/Miragon/mcp-toolkit/pull/22))
* **release:** publish packages to GitHub Packages ([#32](https://github.com/Miragon/mcp-toolkit/pull/32))


### Build System

* **deps:** bump the npm-dependencies group with 3 updates ([#3](https://github.com/Miragon/mcp-toolkit/pull/3))
* **deps:** bump the github-actions group with 3 updates ([#2](https://github.com/Miragon/mcp-toolkit/pull/2))
* **deps-dev:** bump the npm-dependencies group with 5 updates ([#9](https://github.com/Miragon/mcp-toolkit/pull/9))
* **deps:** bump the npm-dependencies group across 1 directory with 19 updates ([#31](https://github.com/Miragon/mcp-toolkit/pull/31))


### Miscellaneous Chores

* add issue templates and `create-ticket` skill ([#11](https://github.com/Miragon/mcp-toolkit/pull/11))
