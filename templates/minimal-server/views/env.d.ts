/**
 * Side-effect CSS imports in views typecheck before the first CLI run — the
 * mcp-use CLI generates a richer `mcp-env.d.ts` (gitignored) on `dev`/`build`,
 * but a fresh clone must pass `pnpm typecheck` without it.
 */
declare module "*.css" {}
