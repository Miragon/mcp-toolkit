import js from "@eslint/js"
import tseslint from "typescript-eslint"
import reactHooks from "eslint-plugin-react-hooks"

export default tseslint.config(
  // templates/ is a standalone consumer project outside the pnpm workspace —
  // its deps aren't installed here, so type-aware linting can't resolve them.
  // It is typechecked and built in its mirror repo's CI (mcp-toolkit-starter).
  { ignores: ["**/dist/**", "**/node_modules/**", "templates/**"] },

  js.configs.recommended,
  tseslint.configs.recommendedTypeChecked,

  // Type-aware parser config for all TS files
  {
    languageOptions: {
      parserOptions: {
        projectService: {
          allowDefaultProject: ["*.config.*s", "packages/*/*.config.*s", "docs/.vitepress/*.ts"],
        },
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/consistent-type-imports": [
        "error",
        { prefer: "type-imports", fixStyle: "inline-type-imports" },
      ],
      "no-console": ["warn", { allow: ["warn", "error"] }],
    },
  },

  // React hooks rules — UI package only
  {
    files: ["packages/ui/src/**/*.{ts,tsx}"],
    plugins: { "react-hooks": reactHooks },
    rules: reactHooks.configs["recommended-latest"].rules,
  },

  // ── Module-boundary enforcement (mirrors CLAUDE.md "Module boundaries") ──
  // These were doc-only conventions; encode the ones that break consumer
  // bundles when violated so drift fails CI instead of shipping. Type-only
  // imports are allowed where the concern is a *runtime* leak (they're erased).

  // core: browser-bundle-safe outside tools/, and no reverse dependency on ui.
  // (tools/ is a server-only subpath kept out of the root barrel; a value
  // import of the mcp-use server runtime anywhere else would leak it into the
  // browser graph. Since 2.x that runtime is the ROOT `mcp-use` entry — the
  // `mcp-use/server` subpath this rule used to name no longer exists.)
  {
    files: ["packages/core/src/**/*.ts"],
    ignores: ["packages/core/src/tools/**", "**/*.test.ts"],
    rules: {
      "@typescript-eslint/no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "mcp-use",
              message:
                "core/src outside tools/ must stay browser-bundle-safe. Value-import mcp-use (the 2.x server runtime) only from core/tools (type-only imports are fine).",
              allowTypeImports: true,
            },
          ],
          patterns: [
            {
              group: ["@miragon/mcp-toolkit-ui", "@miragon/mcp-toolkit-ui/*"],
              message: "core is the bottom of the dependency graph; core must not import ui.",
            },
            {
              group: ["@miragon/mcp-toolkit-tool-codegen"],
              message: "tool-codegen is build-time. Runtime code imports only its /runtime types.",
              allowTypeImports: true,
            },
          ],
        },
      ],
    },
  },

  // ui: never reach into core/tools (pulls the mcp-use server runtime) or
  // build-time tool-codegen.
  {
    files: ["packages/ui/src/**/*.{ts,tsx}"],
    ignores: ["**/*.test.ts", "**/*.test.tsx"],
    rules: {
      "@typescript-eslint/no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "@miragon/mcp-toolkit-core/tools",
              message:
                "ui must never import core/tools — it pulls the mcp-use server runtime into the browser graph.",
            },
          ],
          patterns: [
            {
              group: ["@miragon/mcp-toolkit-tool-codegen"],
              message: "tool-codegen is build-time. Runtime code imports only its /runtime types.",
              allowTypeImports: true,
            },
          ],
        },
      ],
    },
  },

  // ui root barrel: must stay free of mcp-use/react VALUE imports (they pull a
  // langchain transitive). Such symbols ship from ./app / ./hooks, never root.
  {
    files: ["packages/ui/src/index.ts"],
    rules: {
      "@typescript-eslint/no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "mcp-use/react",
              message:
                "The ui root barrel must not value-import mcp-use/react. Export such symbols from the ./app or ./hooks subpaths instead.",
              allowTypeImports: true,
            },
          ],
        },
      ],
    },
  },
)
