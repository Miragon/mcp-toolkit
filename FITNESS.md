# Fitness functions — baseline & conventions

This file is the ground truth for the repo's machine-enforced architecture and
quality gates ("fitness functions"). The gates are written for an **agent that
writes code in this repo**: every rule that lives only in prose is optional to
an agent, so every convention here either has a gate or an honest note that it
is unenforced.

## Principles

- **A gate that has never been red is decoration.** Every new gate is broken on
  purpose once before it ships; the result is documented in its PR.
- **No silent skipping.** Every path that skips a check (cap reached, missing
  artifact, empty diff) logs loudly why.
- **Thresholds start below the baseline, never above.** A gate that is red on
  day one gets disabled, not obeyed.
- **Ratchets move in one direction.** Coverage / mutation thresholds are
  raise-only; debt lists (file length, complexity, ignore lists) are
  shrink-only; mutation allowlists are grow-only. The single documented escape
  is the commit trailer `Ratchet-Exception: <reason>` — it turns the ratchet
  diff-check failure into a warning and is reviewed like any commit (CODEOWNERS
  applies).
- **Numbers carry their scope.** A diff-based score must never read as a
  repo-wide one; unmeasured surfaces are named as unmeasured.
- **Form metrics never replace behaviour tests.** Coverage over the wrong
  promises is 0% safety; the golden-contract and eval gates exist for the
  behaviour half.

## Baseline (measured 2026-08-11)

Full verification run (`typecheck`, `build`, `test`, `lint`, `format:check`)
green at commit `a904577`.

### Tests

| Suite                 | Test files | Tests |
| --------------------- | ---------- | ----- |
| packages/core         | 28         | 274   |
| packages/ui           | 11         | 250   |
| packages/tool-codegen | 1          | 12    |
| examples              | 7          | 43    |

Zero `.only` / `.skip` / `.todo` anywhere — the anti-erosion gate starts sharp.

### Coverage (v8, `src/**` minus tests; no thresholds enforced yet)

| Package      | Statements | Branches | Functions | Lines  |
| ------------ | ---------- | -------- | --------- | ------ |
| core         | 93.88%     | 88.21%   | 91.27%    | 95.21% |
| ui           | 29.00%     | 25.71%   | 18.34%    | 28.87% |
| tool-codegen | 19.37%     | 12.94%   | 34.61%    | 20.68% |

Phase 2 freezes these as per-package thresholds at `floor(baseline) − 2`,
raise-only.

### Complexity > 15 (cyclomatic, target budget 15)

| File                                                            | Today | Frozen ratchet (next 10) |
| --------------------------------------------------------------- | ----- | ------------------------ |
| packages/ui/src/app/builder/builder-reducer.ts (`draftReducer`) | 34    | 40                       |
| packages/ui/src/app/mcp-app-view.tsx (`McpAppView`)             | 29    | 30                       |
| packages/ui/src/app/layout-builder.tsx (`LayoutBuilder`)        | 20    | 20                       |
| packages/core/src/rest/client.ts (`request`)                    | 19    | 20                       |
| packages/tool-codegen/src/cli.ts (`parseArgs`)                  | 18    | 20                       |
| packages/core/src/middleware/role-filter.ts                     | 16    | 20                       |

### File length > 400 effective lines (blank lines / comments skipped)

| File                                      | Today | Frozen ratchet (next 10) |
| ----------------------------------------- | ----- | ------------------------ |
| packages/ui/src/app/layout-builder.tsx    | 715   | 720                      |
| packages/ui/src/app/builder/Workspace.tsx | 456   | 460                      |

Data files are exempt, not frozen: `packages/ui/ui-catalog.json` (published,
drift-guarded by `ui-catalog.test.ts`), `examples/widget-playground/stories.ts`
(fixture data).

### Never measured before this baseline

Mutation score, dead code/dependencies, dependency-graph cycles — no tooling
installed. Introduced in Phases 1 and 4.

### Mutation baseline (measured 2026-08-11, phase 4 — full allowlists)

| Package      | Score  | Mutants (killed/survived/no-cov) | `break` (raise-only) |
| ------------ | ------ | -------------------------------- | -------------------- |
| core         | 75.29% | 1054 / 280 / 66                  | 70                   |
| ui           | 90.10% | 473 / 45 / 7                     | 85                   |
| tool-codegen | 66.67% | 48 / 15 / 9                      | 61                   |

The `mutate` allowlist per `packages/*/stryker.config.json` IS the tested
surface (grow-only): core's untested `register-catalogue-tool.ts` and
tool-codegen's partly-tested `cli.ts` are deliberately outside until phase 5b
lands their tests. React/JSX render surfaces are NOT measured by mutation —
the render-coverage ratchet (phase 5c) is the compensating control.

### knip ignore reasons (shrink-only list in knip.json)

- `tailwindcss` (root): peer of `prettier-plugin-tailwindcss`, invisible to knip.
- `lucide-react` (examples): imported by `OrderStatusCard.tsx` (knip misses the
  hoisted resolution) AND a deliberate single-copy pin — a second copy in the
  graph splits mcp-use into two peer instances and crashes widgets
  (templates/minimal-server/README.md).
- `@miragon/mcp-toolkit-core` (tool-codegen devDep): satisfies the package's
  own peerDependency during development.

Known blind spot: the root `scripts/` dir is masked from knip's unused-file
detection by the lint-staged glob plugin; packages/ + examples/ are the
protected surface (proven by the gate self-test).

### Product promises covered by no test (the behaviour gap)

1. **The LLM-facing tool surface** — no tool's `description`, `title`,
   `annotations`, `inputSchema` `.describe()` texts, `outputSchema` or `_meta`
   keys are pinned by any test. An agent "improving" a description changes the
   behaviour of every model that reads it, invisibly to CI.
2. **Export surface of core and tool-codegen** — no analogue of the ui-catalog
   guard; a removed export does not fail CI.
3. **Starter-template viability** — `templates/minimal-server` is outside the
   workspace: never built or typechecked in this repo, mirrored unverified via
   `rsync --delete`.
4. **Widget data contract, consumer side** — `adapt-data-widget.tsx`
   (`_dataType` resolution), `use-view-data`, `mcp-app-view.tsx`: untested.
5. **`exports`-map resolvability against `dist`** (`./globals.css` points into
   `src/`, tool-codegen's `./templates/*`).
6. **`org-gate` middleware** — a security boundary described in prose only.

Phase 5 closes these in order of "what can an agent break without anything
turning red".

## Rule → phase → tool

| Rule (prose today)                                                                                                                                                                       | Gate                                                                                                                                                 | Phase |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ----- |
| core/src outside `tools/` browser-safe (no `mcp-use` value import)                                                                                                                       | eslint `no-restricted-imports` (exists) + depcruise `core-no-mcp-use-value` (resolved-path, survives entrypoint renames — the PR #127 failure class) | 1     |
| … incl. the unenforced `node:*` half                                                                                                                                                     | depcruise `core-no-node-builtins`, `ui-no-node-builtins`                                                                                             | 1     |
| ui never imports `core/tools`; tool-codegen build-time only; core never imports ui                                                                                                       | eslint (exists) + depcruise mirrors; examples get a lint script; templates get a non-type-aware lint block                                           | 1     |
| ui root barrel free of `mcp-use/react` — transitively                                                                                                                                    | depcruise dist-pass `reachable` rule over `packages/*/dist/index.js`                                                                                 | 1     |
| no import cycles / no unresolvable specifiers                                                                                                                                            | depcruise `no-cycles`, `no-unresolvable`                                                                                                             | 1     |
| widgets touch host only via `useHostBridge` (never `mcp-use/react`, `window.openai`), no `ModelContext`, no `content[0].text`, no hard-coded palette colours, no hand-stamped `_meta.ui` | eslint `no-restricted-syntax` widget block                                                                                                           | 1     |
| relative imports carry `.js` extension                                                                                                                                                   | eslint `no-restricted-syntax` (0 violations today)                                                                                                   | 1     |
| `.describe()` on every inputSchema field                                                                                                                                                 | wire test `examples/test/tool-descriptions.test.ts`                                                                                                  | 1     |
| complexity ≤ 15, file length ≤ 400 effective for new code                                                                                                                                | eslint `complexity` + `max-lines`, ratchet overrides from `ratchets/eslint-ratchets.json`                                                            | 2     |
| per-package coverage never regresses                                                                                                                                                     | `@vitest/coverage-v8` thresholds from `ratchets/coverage-thresholds.json`                                                                            | 2     |
| ratchets protect themselves                                                                                                                                                              | `scripts/check-ratchets.mjs` merge-base diff-check; escape = `Ratchet-Exception:` trailer                                                            | 2b    |
| debt list shrinks                                                                                                                                                                        | refactor PR (layout-builder, Workspace, complexity entries), behaviour-neutral with tools/list dump comparison                                       | 3     |
| mutated code must be caught by tests                                                                                                                                                     | StrykerJS per package, PR-diff gate (`scripts/mutation-diff.mjs`, picomatch, cap 25, loud skip), throwaway cache                                     | 4     |
| no dead files / unused or undeclared deps                                                                                                                                                | knip gate (files, dependencies, unlisted); exports report-only                                                                                       | 4     |
| one aggregated report                                                                                                                                                                    | `pnpm fitness` reads existing artifacts only; missing source → "no run"                                                                              | 4     |
| tools/list + manifest + export surfaces are frozen contracts                                                                                                                             | checked-in JSON goldens + `assertGolden` (`GOLDEN_UPDATE=1` only, forbidden in CI)                                                                   | 5a    |
| tests don't erode                                                                                                                                                                        | `@vitest/eslint-plugin` + `scripts/check-test-erosion.mjs`                                                                                           | 5a    |
| error paths tested (org-gate, REST vs real HTTP, codegen CLI)                                                                                                                            | colocated tests + branch-coverage thresholds                                                                                                         | 5b    |
| template compiles against current sources                                                                                                                                                | `tsc --noEmit` via `examples/tsconfig.template-check.json` (PR) + pack-and-install check (nightly)                                                   | 5b    |
| codegen output drift                                                                                                                                                                     | `examples/test/codegen-drift.test.ts` (in-process, byte-exact)                                                                                       | 5b    |
| every widget/composite renders                                                                                                                                                           | SSR `RENDER_CASES` + story completeness + `renderCoverage` ratchet (jsdom deliberately renounced; mutation score does NOT measure this surface)      | 5c    |
| parsers/coercions hold under arbitrary input                                                                                                                                             | fast-check property tests (layout-schemas, parse-tool-result, translator, codegen determinism)                                                       | 5c    |
| new tests are not flaky                                                                                                                                                                  | 3× run of changed test files (PR), 3× full suite (nightly); `retry` stays 0 repo-wide                                                                | 5c    |
| one verification command                                                                                                                                                                 | `pnpm verify` = `scripts/gates.mjs` manifest; CI jobs run `--only=<ids>` subsets of the same manifest                                                | 5c    |
| tool descriptions actually steer a model                                                                                                                                                 | evals (6 deterministic-scored cases × 3 runs, nightly, pass-rate ratcheted, non-blocking for PRs)                                                    | 5d    |

## Deliberately unenforced (honest list, revisit triggers)

- **Comment style, doc taxonomy placement, "thin handlers"** — human judgment;
  reviewed, not gated.
- **DOM/interaction tests (jsdom/@testing-library)** — SSR via
  `renderToStaticMarkup` is the house path; the render-coverage ratchet is the
  compensating control. Revisit when the builder API is declared stable.
- **Browser E2E against ChatGPT/mcp-use hosts** — host UIs are external; wire
  goldens + host-bridge unit tests are the boundary.
- **Builder chrome colours** (`packages/ui/src/app/builder/*` amber/emerald) —
  outside the widget colour gate for now; revisit in Phase 3.
