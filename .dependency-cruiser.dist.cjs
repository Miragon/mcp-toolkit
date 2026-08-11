/**
 * Built-artifact reachability gates (see FITNESS.md).
 *
 * Runs over the compiled root barrels (packages/<pkg>/dist/index.js) AFTER
 * `pnpm -r build`. In dist all type-only imports are erased, so anything
 * reachable here is a real runtime edge — this closes the transitive gap the
 * per-file eslint rules cannot see (a browser-safe-looking module that leaks
 * the server runtime into the root barrel two hops away).
 *
 * Run: pnpm depcruise:dist
 */
module.exports = {
  options: {
    doNotFollow: { path: "node_modules" },
    exclude: { path: ["\\.d\\.ts$"] },
  },
  forbidden: [
    {
      name: "root-barrel-must-not-reach-mcp-use",
      severity: "error",
      comment:
        "The mcp-use server/view runtime is REACHABLE from a published root barrel (dist/index.js) — transitively forbidden. Follow the chain in the report and cut it: server code belongs in core/tools, mcp-use/react symbols ship from ui's ./app or ./hooks subpaths, types become `import type`.",
      from: { path: "dist/index\\.js$" },
      to: { path: "node_modules/mcp-use", reachable: true },
    },
    {
      name: "root-barrel-must-not-reach-node-builtins",
      severity: "error",
      comment:
        "A node:* builtin is REACHABLE from a published root barrel (dist/index.js) — the barrel must stay browser-bundle-safe. Follow the chain in the report and move the Node-dependent module under core/tools.",
      from: { path: "dist/index\\.js$" },
      to: {
        path: "^(node:|fs$|path$|crypto$|os$|http$|https$|net$|stream$|util$|url$|events$|buffer$|zlib$|child_process$)",
        reachable: true,
      },
    },
  ],
}
