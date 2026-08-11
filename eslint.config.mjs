import js from "@eslint/js"
import tseslint from "typescript-eslint"
import reactHooks from "eslint-plugin-react-hooks"
import vitest from "@vitest/eslint-plugin"
import eslintComments from "@eslint-community/eslint-plugin-eslint-comments"
import eslintRatchets from "./ratchets/eslint-ratchets.json" with { type: "json" }

// ─────────────────────────────────────────────────────────────────────────────
// Shared fitness-gate building blocks (see FITNESS.md).
//
// Flat-config trap: when several config blocks match the same file, a later
// block's value for a rule REPLACES the earlier one — it does not merge.
// Every composed rule below therefore declares its FULL value per file scope,
// built from these shared arrays, so no scope silently loses a gate.
// ─────────────────────────────────────────────────────────────────────────────

// Relative imports carry the compiled extension (ESM output references .js).
// tsc with moduleResolution "bundler" cannot enforce this; this selector can.
const extensionMessage =
  'Relative imports carry the compiled extension in this ESM repo: "./foo" → "./foo.js" (also for type imports).'
const noExtensionlessRelativeImports = [
  "ImportDeclaration",
  "ExportNamedDeclaration",
  "ExportAllDeclaration",
  "ImportExpression",
].map((node) => ({
  selector: `${node}[source.value=/^\\.\\.?\\u002F/]:not([source.value=/\\.(js|json|css)$/])`,
  message: extensionMessage,
}))

// mcp-use owns the _meta.ui namespace and overwrites it on tools/list — a
// hand-stamped key silently disappears.
const metaUiMessage =
  "Never stamp _meta.ui.* by hand — mcp-use owns that namespace and overwrites it on tools/list. Emit it natively via the tool's view/visibility fields; use appsSdkMeta(...) for the openai/* half."
const noHandStampedMetaUi = [
  'Property[key.name="_meta"] > ObjectExpression > Property[key.name="ui"]',
  'Property[key.name="_meta"] > ObjectExpression > Property[key.value=/^ui(\\u002F|$)/]',
  'Property[key.value="_meta"] > ObjectExpression > Property[key.name="ui"]',
  'Property[key.value="_meta"] > ObjectExpression > Property[key.value=/^ui(\\u002F|$)/]',
].map((selector) => ({ selector, message: metaUiMessage }))

const baseSyntaxRestrictions = [...noExtensionlessRelativeImports, ...noHandStampedMetaUi]

// Widget host discipline: a widget reaches the host ONLY through
// useHostBridge() (host-portability contract), decodes tool results only via
// parseToolResult, and styles only with theme tokens (white-label contract).
const paletteRegex =
  "/(^|[\\s\"'`])(bg|text|border|ring|fill|stroke|from|via|to)-(red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|slate|gray|zinc|neutral|stone)-[0-9]/"
const paletteMessage =
  "Hard-coded Tailwind palette colours break white-labeling — use theme tokens (text-primary, bg-card, text-muted-foreground, …) or the tone system (TONE_SOFT/TONE_DOT/TONE_TEXT) from @miragon/mcp-toolkit-ui."
const widgetSyntaxRestrictions = [
  {
    selector: 'ImportDeclaration[source.value="mcp-use/react"][importKind!="type"]',
    message:
      "Widgets reach the host ONLY through useHostBridge() from @miragon/mcp-toolkit-ui/app — never mcp-use/react (its hooks throw outside a bootstrapView mount).",
  },
  {
    selector: 'MemberExpression[object.name="window"][property.name="openai"]',
    message:
      "Never touch window.openai directly — useHostBridge() abstracts the host (createChatGptHostBridge wraps window.openai defensively).",
  },
  {
    selector: 'CallExpression[callee.object.name="window"][callee.property.name="open"]',
    message:
      "Never call window.open directly in a widget — use openExternal(url) from useHostBridge().",
  },
  {
    selector: 'MemberExpression[computed=true][property.value=0][object.property.name="content"]',
    message:
      "Never decode a tool result via content[0].text — use parseToolResult / parseViewToolResult from @miragon/mcp-toolkit-ui.",
  },
  {
    selector: `JSXAttribute[name.name="className"] Literal[value=${paletteRegex}]`,
    message: paletteMessage,
  },
  {
    selector: `JSXAttribute[name.name="className"] TemplateElement[value.raw=${paletteRegex}]`,
    message: paletteMessage,
  },
  {
    selector: 'JSXAttribute[name.name="className"] Literal[value=/rounded-\\[/]',
    message:
      "Arbitrary radius values break the token contract — use the rounded-sm/md/lg/xl tokens.",
  },
  {
    selector: 'JSXAttribute[name.name="style"] Literal[value=/#[0-9a-fA-F]{3}/]',
    message: paletteMessage,
  },
]

// no-restricted-imports entries shared between the ui blocks (see the
// flat-config trap note above — each block re-declares the full set).
const banCoreTools = {
  name: "@miragon/mcp-toolkit-core/tools",
  message:
    "ui must never import core/tools — it pulls the mcp-use server runtime into the browser graph.",
}
const banModelContext = {
  name: "mcp-use/react",
  importNames: ["ModelContext"],
  message:
    "ModelContext from mcp-use/react throws outside a bootstrapView mount. Use HostModelContext from @miragon/mcp-toolkit-ui/app.",
  allowTypeImports: true,
}
const banToolCodegenPattern = {
  group: ["@miragon/mcp-toolkit-tool-codegen"],
  message: "tool-codegen is build-time. Runtime code imports only its /runtime types.",
  allowTypeImports: true,
}

// ── Ratchet metrics (FITNESS.md, phase 2) ──
// Budgets for NEW code: cyclomatic complexity 15, 400 effective lines.
// Files over budget at introduction are frozen at their measured value in
// ratchets/eslint-ratchets.json — SHRINK-ONLY: entries may be lowered or
// removed, never raised or added (enforced by scripts/check-ratchets.mjs in
// phase 2b). Fix the file (split it — the builder-model/builder-reducer
// extraction is the house pattern), don't touch the budget.
const COMPLEXITY_BUDGET = 15
const MAX_EFFECTIVE_LINES = 400
const maxLinesOptions = (max) => ["error", { max, skipBlankLines: true, skipComments: true }]
// scripts/tighten-ratchets.mjs re-measures with the overrides disabled so the
// global budgets report the true current values.
const measuringRatchets = process.env.FITNESS_RATCHET_MEASURE === "1"
const ratchetedFiles = measuringRatchets
  ? []
  : [
      ...new Set([
        ...Object.keys(eslintRatchets["max-lines"]),
        ...Object.keys(eslintRatchets.complexity),
      ]),
    ]
const ratchetOverrides = ratchetedFiles.map((file) => ({
  files: [file],
  rules: {
    ...(file in eslintRatchets["max-lines"]
      ? { "max-lines": maxLinesOptions(eslintRatchets["max-lines"][file]) }
      : {}),
    ...(file in eslintRatchets.complexity
      ? { complexity: ["error", { max: eslintRatchets.complexity[file] }] }
      : {}),
  },
}))

export default tseslint.config(
  // examples/test/fixtures holds pre-built JS stand-ins (mcp-app.js) that the
  // project service cannot type — data, not code.
  // .mcp-use/ + mcp-env.d.ts are generated by the mcp-use CLI build
  // (check-standalone-dist gate) — tool output, never linted.
  {
    ignores: [
      "**/dist/**",
      "**/node_modules/**",
      "examples/test/fixtures/**",
      "**/.mcp-use/**",
      "**/mcp-env.d.ts",
    ],
  },

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

  // templates/ is a standalone consumer project outside the pnpm workspace —
  // its deps aren't installed here, so type-aware linting can't resolve them
  // (it is typechecked and built in its mirror repo's CI, mcp-toolkit-starter).
  // The syntax-level fitness gates below DO apply; `pnpm lint:templates` runs
  // them (templates is outside the workspace, so `pnpm -r run lint` never
  // reaches it).
  {
    files: ["templates/**/*.{ts,tsx}"],
    extends: [tseslint.configs.disableTypeChecked],
  },

  // React hooks rules — UI package only
  {
    files: ["packages/ui/src/**/*.{ts,tsx}"],
    plugins: { "react-hooks": reactHooks },
    rules: reactHooks.configs["recommended-latest"].rules,
  },

  // ── Module-boundary enforcement (mirrors CLAUDE.md "Module boundaries") ──
  // These eslint rules match literal import specifiers, which gives instant
  // in-editor feedback but silently degrades when an upstream entrypoint is
  // renamed (the pre-#127 failure). The dependency-cruiser configs
  // (.dependency-cruiser.cjs / .dependency-cruiser.dist.cjs) hold the
  // resolved-path + transitive versions of the same boundaries and are the
  // authoritative gate.

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
            banToolCodegenPattern,
          ],
        },
      ],
    },
  },

  // ui: never reach into core/tools (pulls the mcp-use server runtime) or
  // build-time tool-codegen; never the throwing native ModelContext.
  {
    files: ["packages/ui/src/**/*.{ts,tsx}"],
    ignores: ["**/*.test.ts", "**/*.test.tsx", "packages/ui/src/index.ts"],
    rules: {
      "@typescript-eslint/no-restricted-imports": [
        "error",
        { paths: [banCoreTools, banModelContext], patterns: [banToolCodegenPattern] },
      ],
    },
  },

  // …except the one adapter that BUILDS HostModelContext from the native one.
  {
    files: ["packages/ui/src/app/adapt-data-widget.tsx"],
    rules: {
      "@typescript-eslint/no-restricted-imports": [
        "error",
        { paths: [banCoreTools], patterns: [banToolCodegenPattern] },
      ],
    },
  },

  // ui root barrel: must stay free of ALL mcp-use/react value imports (they
  // pull the 2.x view runtime and its ext-apps transitive). Such symbols ship
  // from ./app / ./hooks, never the root.
  {
    files: ["packages/ui/src/index.ts"],
    rules: {
      "@typescript-eslint/no-restricted-imports": [
        "error",
        {
          paths: [
            banCoreTools,
            {
              name: "mcp-use/react",
              message:
                "The ui root barrel must not value-import mcp-use/react. Export such symbols from the ./app or ./hooks subpaths instead.",
              allowTypeImports: true,
            },
          ],
          patterns: [banToolCodegenPattern],
        },
      ],
    },
  },

  // examples: same build-time and ModelContext discipline as the packages.
  // (Tests are exempt: the drift/gate tests import tool-codegen on purpose.)
  {
    files: ["examples/**/*.{ts,tsx}"],
    ignores: ["examples/test/**", "**/*.test.ts", "**/*.test.tsx"],
    rules: {
      "@typescript-eslint/no-restricted-imports": [
        "error",
        { paths: [banModelContext], patterns: [banToolCodegenPattern] },
      ],
    },
  },

  // templates views are widget code shipped to consumers: full widget
  // discipline plus the browser-graph import bans.
  {
    files: ["templates/**/views/**/*.{ts,tsx}"],
    rules: {
      "@typescript-eslint/no-restricted-imports": [
        "error",
        { paths: [banCoreTools, banModelContext], patterns: [banToolCodegenPattern] },
      ],
    },
  },

  // ── Syntax-level fitness gates ──
  // Base restrictions for all first-party source (tests exempt: they assert
  // wire shapes like _meta["ui/resourceUri"] on purpose).
  {
    files: ["packages/*/src/**/*.{ts,tsx}", "examples/**/*.{ts,tsx}", "templates/**/*.{ts,tsx}"],
    ignores: ["**/*.test.ts", "**/*.test.tsx", "examples/test/**"],
    rules: {
      "no-restricted-syntax": ["error", ...baseSyntaxRestrictions],
    },
  },

  // Widget scopes get the base restrictions PLUS host/styling discipline.
  // (Full re-declaration — a later block replaces, never merges.)
  {
    files: [
      "examples/modules/*/widgets/**/*.{ts,tsx}",
      "examples/host-portability/OrderStatusCard.tsx",
      "examples/widget-playground/CustomerCard.tsx",
      "examples/widget-playground/MetricsShowcase.tsx",
      "templates/**/views/**/*.{ts,tsx}",
    ],
    rules: {
      "no-restricted-syntax": ["error", ...baseSyntaxRestrictions, ...widgetSyntaxRestrictions],
    },
  },

  // ── Anti-erosion gates for test files (FITNESS.md, phase 5a) ──
  // A flaky assertion is an invitation to weaken it; a skipped test is a
  // deleted test with better optics. Focused/disabled tests and constant
  // assertions are errors, and every eslint-disable inside a test needs a
  // written reason (`-- <why>`), so each escape is visible in the diff.
  {
    files: ["**/*.test.ts", "**/*.test.tsx"],
    plugins: { vitest, "@eslint-community/eslint-comments": eslintComments },
    rules: {
      "vitest/no-focused-tests": "error",
      "vitest/no-disabled-tests": "error",
      "vitest/expect-expect": "error",
      "@eslint-community/eslint-comments/require-description": ["error", { ignore: [] }],
      "no-restricted-syntax": [
        "error",
        {
          selector:
            "CallExpression[callee.name='expect'][arguments.0.type='Literal'][arguments.0.regex=undefined]",
          message:
            "expect(<literal>) asserts a constant — it can never fail and only inflates counts. Assert real behaviour or delete the line.",
        },
      ],
    },
  },

  // ── Ratchet metric budgets (see the constants above) ──
  // Data files are exempt, not frozen: stories.ts is fixture data
  // (ui-catalog.json is JSON and never linted).
  {
    files: ["packages/*/src/**/*.{ts,tsx}", "examples/**/*.{ts,tsx}", "templates/**/*.{ts,tsx}"],
    ignores: ["**/*.test.ts", "**/*.test.tsx", "examples/widget-playground/stories.ts"],
    rules: {
      complexity: ["error", { max: COMPLEXITY_BUDGET }],
      "max-lines": maxLinesOptions(MAX_EFFECTIVE_LINES),
    },
  },
  ...ratchetOverrides,
)
