# Changelog

All notable changes to this project will be documented in this file.

This changelog is generated from the conventional-commit history that preceded
release-please. Future entries are written by release-please on tagged releases.

## [1.0.0](https://github.com/Miragon/mcp-toolkit/compare/v1.0.0...v1.0.0) (2026-08-10)


### Bug Fixes

* **release:** add repository field for npm provenance publishing ([#120](https://github.com/Miragon/mcp-toolkit/issues/120)) ([9f3cad2](https://github.com/Miragon/mcp-toolkit/commit/9f3cad2f796598b3604ac1858426f2510aa2ddcf))

## [1.0.0](https://github.com/Miragon/mcp-toolkit/compare/v0.11.0...v1.0.0) (2026-08-10)


### ⚠ BREAKING CHANGES

* 1.0.0 is the mcp-use 2.x native-views line. Migrating from 0.10.x? Follow docs/guides/migrating-to-mcp-use-2.md. Already on 0.11.0? Nothing further to migrate.

### Features

* promote the mcp-use 2.x native-views line to 1.0.0 ([#117](https://github.com/Miragon/mcp-toolkit/issues/117)) ([482e6d5](https://github.com/Miragon/mcp-toolkit/commit/482e6d512f1befe72595af0714d8cdf6639833eb))

## [0.11.0](https://github.com/Miragon/mcp-toolkit/compare/v0.10.1...v0.11.0) (2026-08-10)


### ⚠ BREAKING CHANGES

* **core,ui,examples:** migrate to mcp-use 2.x native views ([#114](https://github.com/Miragon/mcp-toolkit/issues/114))

### Features

* **core,ui,examples:** migrate to mcp-use 2.x native views ([#114](https://github.com/Miragon/mcp-toolkit/issues/114)) ([95e5cdb](https://github.com/Miragon/mcp-toolkit/commit/95e5cdbff3d26a63c2db58466fdb2816f22b2009))

## [0.10.1](https://github.com/Miragon/mcp-toolkit/compare/v0.10.0...v0.10.1) (2026-07-28)


### Bug Fixes

* **core:** accept JSON-string layout in render-view/refresh-view ([#105](https://github.com/Miragon/mcp-toolkit/issues/105)) ([214550d](https://github.com/Miragon/mcp-toolkit/commit/214550d213c24d965bc51049f11a2cb33f2becff))

## [0.10.0](https://github.com/Miragon/mcp-toolkit/compare/v0.9.0...v0.10.0) (2026-07-28)


### Features

* **core:** pass mcp-use server options through createFrameworkApp ([#103](https://github.com/Miragon/mcp-toolkit/issues/103)) ([0ccde69](https://github.com/Miragon/mcp-toolkit/commit/0ccde69a153ad0a7adbd9e9d0c7fadc5075f4d8a))

## [0.9.0](https://github.com/Miragon/mcp-toolkit/compare/v0.8.0...v0.9.0) (2026-07-17)


### ⚠ BREAKING CHANGES

* createFrameworkApp drops the previously required `proxies` option along with `callbackBaseUrl`, `hostReactMajor`, and `secretResolver`; the boot path collapses to first-party loadApps + per-plugin appConfigs. registerFrameworkTools drops its `proxies` option and no longer registers read-widget-bundle. The core ./proxy subpath and the proxy-contract package are gone.

### Features

* **core,examples:** hosted playground with Fly deployment and guided-tour docs ([#91](https://github.com/Miragon/mcp-toolkit/issues/91)) ([8143761](https://github.com/Miragon/mcp-toolkit/commit/8143761514f6669cbda38eac8167206cfca24607))
* remove upstream/proxy federation — external MCP gateways own aggregation ([#100](https://github.com/Miragon/mcp-toolkit/issues/100)) ([8d42dfc](https://github.com/Miragon/mcp-toolkit/commit/8d42dfc8a65b0d8d918c5511898a3a814250f479))

## [0.8.0](https://github.com/Miragon/mcp-toolkit/compare/v0.7.2...v0.8.0) (2026-07-07)


### Features

* **core,ui:** dual-protocol widget contract + tool-result recovery ([#84](https://github.com/Miragon/mcp-toolkit/issues/84)) ([9b543b0](https://github.com/Miragon/mcp-toolkit/commit/9b543b0ada6f6f4fa53b898c3e1c8c23415e3ce5))

## [0.7.2](https://github.com/Miragon/mcp-toolkit/compare/v0.7.1...v0.7.2) (2026-07-06)


### Bug Fixes

* **core,ui:** batch-aware tools/call name capture + first-render widget props sync ([#82](https://github.com/Miragon/mcp-toolkit/issues/82)) ([af1df0e](https://github.com/Miragon/mcp-toolkit/commit/af1df0e71050fa3e92dc8b769d5b930ee8df8986))

## [0.7.1](https://github.com/Miragon/mcp-toolkit/compare/v0.7.0...v0.7.1) (2026-07-06)


### Bug Fixes

* **deps:** bump mcp-use to 1.34.1 ([#80](https://github.com/Miragon/mcp-toolkit/issues/80)) ([9b939f9](https://github.com/Miragon/mcp-toolkit/commit/9b939f9ddadf6c750b3a25cfc99a72a1004f8b9a))

## [0.7.0](https://github.com/Miragon/mcp-toolkit/compare/v0.6.1...v0.7.0) (2026-07-06)


### Features

* developer-experience overhaul — quickstart, starter template, docs deploy ([#76](https://github.com/Miragon/mcp-toolkit/issues/76)) ([8e1e9b0](https://github.com/Miragon/mcp-toolkit/commit/8e1e9b02334d443daa73a3ef9579825b79236c1a))


### Bug Fixes

* **core:** harden proxy auth, boot isolation, and tool-result contracts ([#73](https://github.com/Miragon/mcp-toolkit/issues/73)) ([dddb41c](https://github.com/Miragon/mcp-toolkit/commit/dddb41cf7c8b0cc2cddc6d938a78c9079f4640e5))
* **deps:** bump mcp-use to 1.33.0 ([#77](https://github.com/Miragon/mcp-toolkit/issues/77)) ([e26f44c](https://github.com/Miragon/mcp-toolkit/commit/e26f44cccddd76a1b045b47253e57303b855dddf))

## [0.6.1](https://github.com/Miragon/mcp-toolkit/compare/v0.6.0...v0.6.1) (2026-06-17)


### Bug Fixes

* require mcp-use 1.32.1 as peer dependency ([#67](https://github.com/Miragon/mcp-toolkit/issues/67)) ([6da3225](https://github.com/Miragon/mcp-toolkit/commit/6da32255848655c58dda3356ce7c60b8bffa7d5c))

## [0.6.0](https://github.com/Miragon/mcp-toolkit/compare/v0.5.0...v0.6.0) (2026-06-17)


### Features

* **core,ui:** i18n base — createTranslator + LocaleProvider ([#64](https://github.com/Miragon/mcp-toolkit/issues/64)) ([c4d810e](https://github.com/Miragon/mcp-toolkit/commit/c4d810e13b7c0748afc6243d416f6b85c347e45f))

## [0.5.0](https://github.com/Miragon/mcp-toolkit/compare/v0.4.0...v0.5.0) (2026-06-11)


### Features

* **core:** add BackendRegistry.getSelected() session-selection reader ([#60](https://github.com/Miragon/mcp-toolkit/issues/60)) ([8222cc3](https://github.com/Miragon/mcp-toolkit/commit/8222cc366dbffdaa11d385ac9e450ead581a9c3f))


### Bug Fixes

* **ci:** use org-wide RELEASE_PLEASE_APP_* var and secret names ([#61](https://github.com/Miragon/mcp-toolkit/issues/61)) ([4564ad0](https://github.com/Miragon/mcp-toolkit/commit/4564ad093bf4b210408007197a2086d9ab9f3165))

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
