import { builtinModules } from "node:module"
import { defineConfig } from "eslint/config"
import js from "@eslint/js"
import tseslint from "typescript-eslint"
import reactHooks from "eslint-plugin-react-hooks"
import vitest from "@vitest/eslint-plugin"
import eslintComments from "@eslint-community/eslint-plugin-eslint-comments"

// Flat-config trap: when several blocks match a file, a later block's value for a rule REPLACES
// the earlier one, it does not merge. no-restricted-syntax and no-restricted-imports are
// therefore declared in full for every file scope, built from the arrays below.

const TEST_FILES = ["**/*.test.ts", "**/*.test.tsx"]

// Relative imports carry the compiled extension (the ESM output references .js). tsc with
// moduleResolution "bundler" cannot enforce this; the selector can.
const relativeImportsCarryExtension = [
  "ImportDeclaration",
  "ExportNamedDeclaration",
  "ExportAllDeclaration",
  "ImportExpression",
].map((node) => ({
  selector: `${node}[source.value=/^\\.\\.?\\u002F/]:not([source.value=/\\.(js|json|css)$/])`,
  message:
    'Relative imports carry the compiled extension in this ESM repo: "./foo" → "./foo.js" (also for type imports).',
}))

const constantExpect = {
  selector:
    "CallExpression[callee.name='expect'][arguments.0.type='Literal'][arguments.0.regex=undefined]",
  message:
    "expect(<literal>) asserts a constant: it can never fail. Assert real behaviour or delete the line.",
}

// Every Node built-in, bare (`fs`, `fs/promises`) or `node:`-prefixed.
const nodeBuiltinNames = [
  ...new Set(
    builtinModules.filter((name) => !name.startsWith("node:")).map((name) => name.split("/")[0]),
  ),
]
const noNodeBuiltins = (pkg) => ({
  regex: `^(node:|(${nodeBuiltinNames.join("|")})(/|$))`,
  message: `${pkg} runs in browsers and MCP Apps widgets: no Node built-in modules.`,
})

export default defineConfig(
  {
    ignores: ["**/dist/", "**/node_modules/", "**/coverage/", "**/reports/", "**/.stryker-tmp/"],
  },

  js.configs.recommended,
  tseslint.configs.recommendedTypeChecked,

  {
    languageOptions: {
      parserOptions: {
        // Config files at a package root sit outside the package's tsconfig (include: src). An
        // example's tsconfig includes its own config files; listing them here as well would make
        // typescript-eslint refuse the double match.
        projectService: {
          allowDefaultProject: ["packages/*/*.config.ts"],
        },
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      "@typescript-eslint/consistent-type-imports": [
        "error",
        { prefer: "type-imports", fixStyle: "inline-type-imports" },
      ],
      "no-console": ["warn", { allow: ["warn", "error"] }],
      "no-restricted-syntax": ["error", ...relativeImportsCarryExtension],
    },
  },

  // Node scripts (eslint.config.mjs, scripts/*.mjs): no tsconfig covers them, so they are
  // linted without type information, against the Node globals they use; their output is the
  // console.
  {
    files: ["**/*.{js,mjs,cjs}"],
    extends: [tseslint.configs.disableTypeChecked],
    languageOptions: { globals: { console: "readonly", process: "readonly" } },
    rules: { "no-console": "off" },
  },

  {
    files: ["packages/tool-codegen-react/src/**/*.{ts,tsx}", "examples/**/*.{ts,tsx}"],
    plugins: { "react-hooks": reactHooks },
    rules: reactHooks.configs.flat.recommended.rules,
  },

  // ── Package boundaries (runtime code; tests may import whatever they exercise) ──

  // core: framework-free and dependency-free, so it runs in browsers, widgets and Node alike.
  {
    files: ["packages/tool-codegen-core/src/**/*.ts"],
    ignores: TEST_FILES,
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              regex: "^(react|react-dom)(/|$)",
              message:
                "tool-codegen-core is framework-free: React code belongs in tool-codegen-react.",
            },
            {
              regex: "^@tanstack/",
              message:
                "tool-codegen-core is framework-free: TanStack Query belongs in tool-codegen-react.",
            },
            {
              regex: "^@modelcontextprotocol/",
              message:
                "tool-codegen-core has zero dependencies: adapt an MCP client structurally (McpClientLike), never import the SDK.",
            },
            noNodeBuiltins("tool-codegen-core"),
            {
              regex: "^@miragon/mcp-toolkit-tool-codegen(-react)?(/|$)",
              message:
                "tool-codegen-core is the bottom of the graph: it never imports the codegen CLI or the React hooks.",
            },
          ],
        },
      ],
    },
  },

  // react: browser code over core; the generator is a build-time Node package.
  {
    files: ["packages/tool-codegen-react/src/**/*.{ts,tsx}"],
    ignores: TEST_FILES,
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            noNodeBuiltins("tool-codegen-react"),
            {
              regex: "^@miragon/mcp-toolkit-tool-codegen(/|$)",
              message:
                "tool-codegen is build-time (Node): the hooks take their runtime from @miragon/mcp-toolkit-tool-codegen-core.",
            },
          ],
        },
      ],
    },
  },

  // examples: the generator runs at build time only (codegen.config.ts, the drift tests).
  {
    files: ["examples/**/*.{ts,tsx}"],
    ignores: [...TEST_FILES, "examples/*/test/**", "examples/*/codegen.config.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              regex: "^@miragon/mcp-toolkit-tool-codegen(/|$)",
              allowTypeImports: true,
              message:
                "tool-codegen is a build-time devDependency: runtime code imports the generated client, tool-codegen-core and tool-codegen-react.",
            },
          ],
        },
      ],
    },
  },

  // ── Size budgets for runtime source ──
  {
    files: ["packages/*/src/**/*.{ts,tsx}", "examples/*/src/**/*.{ts,tsx}"],
    ignores: TEST_FILES,
    rules: {
      complexity: ["error", { max: 15 }],
      "max-lines": ["error", { max: 400, skipBlankLines: true, skipComments: true }],
    },
  },

  // ── Tests: no focused or skipped tests, no assertion-free tests, every disable explained ──
  {
    files: TEST_FILES,
    plugins: { vitest, "@eslint-community/eslint-comments": eslintComments },
    rules: {
      "vitest/no-focused-tests": "error",
      "vitest/no-disabled-tests": "error",
      // Type tests assert with expectTypeOf (tsc checks them in `pnpm typecheck`).
      "vitest/expect-expect": [
        "error",
        { assertFunctionNames: ["expect", "expectTypeOf", "assertType"] },
      ],
      "@eslint-community/eslint-comments/require-description": ["error", { ignore: [] }],
      "no-restricted-syntax": ["error", ...relativeImportsCarryExtension, constantExpect],
    },
  },
)
