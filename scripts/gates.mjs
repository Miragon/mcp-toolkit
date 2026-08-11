/**
 * THE single source of truth for every fitness gate (FITNESS.md, phase 5c).
 *
 * scripts/verify.mjs runs these locally; the CI jobs run subsets via
 * `node scripts/verify.mjs --only=<ids>` — local and CI cannot diverge
 * because both execute THIS manifest, and the verify-manifest test asserts
 * the CI subsets cover every id (a gate missing from all jobs = silent
 * skip = red suite).
 *
 * Order matters: cheap/static first, build before the gates that need dist,
 * tests before the diff-scoped repeat runner.
 */
export const GATES = [
  {
    id: "pins",
    title: "Exact dependency pins",
    cmd: ["node", "scripts/check-pins.mjs"],
    fix: "Pin exact versions in package.json (no ^ ~ >= *) — copy the resolved version from pnpm-lock.yaml.",
  },
  {
    id: "typecheck",
    title: "Typecheck (workspace)",
    cmd: ["pnpm", "-r", "run", "typecheck"],
    fix: "Fix the reported type errors; tsconfig.base.json is the single source of compiler options.",
  },
  {
    id: "template",
    title: "Starter-template typecheck",
    cmd: ["pnpm", "--filter", "@miragon/mcp-toolkit-examples", "run", "typecheck:template"],
    fix: "templates/minimal-server no longer compiles against current core/ui sources — fix the API drift (or the template) in the SAME PR.",
  },
  {
    id: "build",
    title: "Build (workspace)",
    cmd: ["pnpm", "-r", "run", "build"],
    fix: "Fix the build; later gates (dist reachability, exports, goldens) run against these artifacts.",
  },
  {
    id: "depcruise",
    title: "Dependency rules (source)",
    cmd: ["pnpm", "depcruise"],
    fix: "A named boundary rule fired — its message says which house path to use instead (.dependency-cruiser.cjs).",
  },
  {
    id: "depcruise-dist",
    title: "Root-barrel reachability (dist)",
    cmd: ["pnpm", "depcruise:dist"],
    fix: "The compiled root barrel transitively reaches the server runtime or node builtins — cut the chain shown in the report (server code belongs in core/tools).",
  },
  {
    id: "exports",
    title: "Package exports (publint + attw)",
    cmd: ["node", "scripts/check-package-exports.mjs"],
    fix: "Fix package.json exports/files or the build output — never this check.",
  },
  {
    id: "ratchets",
    title: "Ratchet direction",
    cmd: ["node", "scripts/check-ratchets.mjs"],
    fix: "Thresholds only move one way — fix the code, not the number. Single escape: commit trailer 'Ratchet-Exception: <reason>'.",
  },
  {
    id: "erosion",
    title: "Test erosion",
    cmd: ["node", "scripts/check-test-erosion.mjs"],
    fix: "Replace deleted/removed tests with ones pinning the new contract; never add retry:. Single escape: the Ratchet-Exception trailer.",
  },
  {
    id: "knip",
    title: "Dead code (knip)",
    cmd: ["pnpm", "knip:gate"],
    fix: "Delete the dead file / declare the dependency. Ignore lists are shrink-only.",
  },
  {
    id: "test",
    title: "Tests + coverage floors (incl. goldens, gate self-tests)",
    cmd: ["pnpm", "test:coverage"],
    fix: "A failing golden means the frozen surface changed — if intended, GOLDEN_UPDATE=1 locally and justify the JSON diff. A coverage floor miss means: write the missing tests.",
  },
  {
    id: "codegen-drift",
    title: "Codegen drift (committed generated/)",
    cmd: ["pnpm", "--filter", "@miragon/mcp-toolkit-examples", "run", "generate:check:ci"],
    fix: "Regenerate: pnpm --filter @miragon/mcp-toolkit-examples run generate (codegen-source auto-boots) and commit generated/.",
  },
  {
    id: "flaky-changed",
    title: "Flakiness (changed tests 3x)",
    cmd: ["node", "scripts/check-flakiness.mjs"],
    fix: "Make the flagged test deterministic (inject clocks, listen(0) ports); never retry:.",
  },
  {
    id: "lint",
    title: "Lint (workspace incl. anti-erosion)",
    cmd: ["pnpm", "lint"],
    fix: "Every rule message names the house path to use instead; --max-warnings 0 is intentional.",
  },
  {
    id: "lint-templates",
    title: "Lint (starter template)",
    cmd: ["pnpm", "lint:templates"],
    fix: "The shipped starter violates a widget gate — fix templates/minimal-server (it is consumer-facing).",
  },
  {
    id: "format",
    title: "Formatting",
    cmd: ["pnpm", "format:check"],
    fix: "Run pnpm format.",
  },
]
