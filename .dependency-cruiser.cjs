/**
 * Source-level dependency gates (see FITNESS.md).
 *
 * dependency-cruiser matches the RESOLVED path, not the literal specifier —
 * the eslint boundary rules match specifiers and therefore silently degrade
 * to no-ops when an upstream package renames an entrypoint (that is exactly
 * what PR #127 fixed). These rules survive such renames, and the
 * `no-unresolvable` rule turns a dangling specifier itself into an error.
 *
 * Run: pnpm depcruise
 */
module.exports = {
  options: {
    doNotFollow: { path: "node_modules" },
    exclude: {
      // Workspace-scoped ONLY: a broad "/dist/" or ".d.ts" exclude would also
      // drop resolved node_modules files (e.g. mcp-use/dist/…) from the graph
      // and silently disarm every rule that targets them.
      path: [
        "\\.test\\.(ts|tsx)$",
        "examples/test/fixtures",
        "^packages/[^/]+/dist/",
        "^examples/.*/dist/",
        // Workspace declaration files (vite-env.d.ts etc.) carry only
        // type-level references (e.g. "vite/client") — no runtime edges.
        "^(packages|examples)/.*\\.d\\.ts$",
      ],
    },
    tsPreCompilationDeps: true,
    tsConfig: { fileName: "tsconfig.base.json" },
    enhancedResolveOptions: {
      exportsFields: ["exports"],
      conditionNames: ["import", "node", "default"],
      extensions: [".ts", ".tsx", ".js", ".jsx", ".json"],
    },
  },
  forbidden: [
    {
      name: "core-no-mcp-use-value",
      severity: "error",
      comment:
        "core/src outside tools/ must stay browser-bundle-safe. Value-import the mcp-use server runtime ONLY from packages/core/src/tools/**. Fix: make it an `import type`, or move the code into core/tools.",
      from: { path: "^packages/core/src", pathNot: "^packages/core/src/tools" },
      to: { path: "node_modules/mcp-use", dependencyTypesNot: ["type-only"] },
    },
    {
      name: "core-no-node-builtins",
      severity: "error",
      comment:
        "core/src outside tools/ must stay browser-bundle-safe: no node:* builtins. Fix: move the code into packages/core/src/tools/** (server-only), or inject the Node dependency from there.",
      from: { path: "^packages/core/src", pathNot: "^packages/core/src/tools" },
      to: { dependencyTypes: ["core"], dependencyTypesNot: ["type-only"] },
    },
    {
      name: "ui-no-node-builtins",
      severity: "error",
      comment:
        "packages/ui is a pure browser package: no node:* builtins. Use browser APIs, or move the code into examples/host (server side).",
      from: { path: "^packages/ui/src" },
      to: { dependencyTypes: ["core"], dependencyTypesNot: ["type-only"] },
    },
    {
      name: "core-must-not-import-ui",
      severity: "error",
      comment:
        "core is the bottom of the dependency graph and never imports ui. Move shared code down into core instead.",
      from: { path: "^packages/core" },
      to: { path: "^packages/ui|node_modules/@miragon/mcp-toolkit-ui" },
    },
    {
      name: "no-cycles",
      severity: "error",
      comment:
        "Import cycle. Extract the shared part into its own module; never import 'back up' the graph.",
      from: {},
      to: { circular: true },
    },
    {
      name: "no-unresolvable",
      severity: "error",
      comment:
        "Import does not resolve — most likely an entrypoint that does not exist (anymore), like the pre-#127 'mcp-use/server'. Check the specifier against the target package's exports map.",
      from: { path: "^(packages|examples)/" },
      to: { couldNotResolve: true },
    },
  ],
}
