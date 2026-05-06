---
paths:
  - "docs/**/*.md"
  - "packages/*/src/index.ts"
  - "packages/*/src/**/index.ts"
  - "packages/*/src/types/**"
  - "packages/*/src/framework/manifest.ts"
  - "packages/*/src/framework/layout-schemas.ts"
  - "packages/*/src/framework/layout-types.ts"
  - "packages/proxy-contract/src/module-manifest.ts"
  - "packages/*/package.json"
---

# Keep documentation in lockstep with public API

The `docs/` tree is published as a VitePress site. Drift between the
source of truth (TypeScript types, Zod schemas, package `exports`) and
the docs hurts downstream consumers and breaks the DoD in
`CONTRIBUTING.md` ("every public symbol lives in a `docs/reference/api-*.md`
file with a signature and a one-line description").

## When this rule fires

The rule activates when you touch any of:

- `docs/**` — content edits
- `packages/*/src/index.ts` and any subpath barrel `packages/*/src/**/index.ts`
- `packages/*/src/types/**` — public type definitions
- `packages/*/src/framework/manifest.ts`, `framework/layout-schemas.ts`, `framework/layout-types.ts`
- `packages/proxy-contract/src/module-manifest.ts`
- `packages/*/package.json` — the `exports` map

Use the trigger as a checklist prompt, not a blocker: most edits won't
need a doc change, but you should _confirm_ that before declaring done.

## What to check

1. **Public surface change?** If you added/removed/renamed an exported
   symbol or a subpath in `package.json` `exports`, the matching
   `docs/reference/api-<package>.md` must reflect it in the same PR.
   New subpath → new section in the reference doc.
2. **Schema change?** If a Zod schema or a public TS type gained/lost a
   field (e.g. `WidgetDefinition.consumes`, `PipelineStepDefinition.optionalKeys`,
   layout cell `props`), update the codeblock in the corresponding
   concept doc (`docs/concepts/`) and the type row in the reference doc.
3. **Manifest change?** `getFrameworkManifest`'s output shape lives in
   `manifest.ts`. The `FrameworkManifest` row in `api-core.md` and the
   "render payload" snippet in `concepts/widgets.md` need to agree with it.
4. **New guide/recipe?** If the work introduces a new way to do
   something, add a guide under `docs/guides/` or a recipe under
   `docs/recipes/`. Link it from `docs/README.md` and the VitePress
   sidebar (`docs/.vitepress/config.ts`).

## Doc taxonomy

Pick the right home — these aren't synonyms:

| Bucket                    | Contains                                                                                                   |
| ------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `docs/concepts/`          | _Why and how_ — architecture, contracts, mental models. Read once.                                         |
| `docs/guides/`            | _End-to-end walkthroughs_ — "do this thing from scratch". Always end with a link into `examples/`.         |
| `docs/reference/api-*.md` | _Every public symbol_ — table form, signature, one-line description. Source-of-truth for the API surface.  |
| `docs/recipes/`           | _Small focused how-tos_ — "I want to add an OAuth2 upstream". Self-contained.                              |
| `docs/plans/`             | _Historical / shipped designs_ — kept for context. Mark `Status: shipped` and link to current docs at top. |

## VitePress gotchas (learned the hard way)

Markdown that's perfectly valid on GitHub can break the VitePress build
because Vue's HTML compiler runs over the rendered output. Avoid:

- **Multi-line inline code spans containing `<X>` tags.** Markdown
  allows backtick spans across newlines; Vue's HTML parser does not
  apply `v-pre` to them and will see `<userId>` / `<name>` as unclosed
  tags. Keep inline code single-line, or move the snippet into a fenced
  code block.
- **`{{...}}` inside backticks.** Vue parses it as interpolation even
  inside inline code. For JSX-style examples, prefer
  `<Component prop={varName} />` over `<Component prop={{ ...obj }} />`,
  or move the example into a fenced block.
- **Generic placeholders like `<Proxy>CallTool` in prose.** Same parser
  issue. Rewrite as `<…>CallTool` in prose, or as a concrete name
  (`LexofficeCallTool`) and explain "for your proxy" alongside.

Cross-repo links (`../../examples/...`, `../../packages/...`) are
intentionally ignored by `ignoreDeadLinks` in
`docs/.vitepress/config.ts`. They're correct on GitHub and on the file
system; the VitePress site doesn't render those targets. Don't reroute
them and don't add new patterns to `ignoreDeadLinks` without thinking.

## Workflow before declaring done

For trivial doc changes (typos, single-line clarifications):

```sh
pnpm format:check
```

For non-trivial doc changes (new sections, new docs, restructured
content) — also run the build to catch Vue/Markdown mismatches and
broken intra-doc links:

```sh
pnpm docs:build
```

Optionally browse the result locally:

```sh
pnpm docs:dev      # http://localhost:5173
```

For public-API changes, the same PR must include both the code change
and the doc change. Splitting them lets the docs drift between merges.

## Style nudges

- **Be terse.** Reference docs are tables; concepts are short paragraphs.
  No multi-paragraph docstrings.
- **Pin paths.** Reference the source file — `packages/core/src/types/widget.ts` —
  so a future reader can verify against the code.
- **Don't restate the code.** A reference entry says _what_ a symbol is;
  it doesn't paste the implementation.
- **Reuse the vocabulary already in the codebase.** "Step", "widget",
  "key", "proxy", "manifest" — established terms. New synonyms cause
  drift.
