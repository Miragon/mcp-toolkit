---
name: white-label-client
description: >-
  White-label a client UI with the @miragon/mcp-toolkit theming system. Use when
  asked to "re-brand"/"white-label" a UI, apply a client's brand colours, set up
  createTheme / ThemeProvider / themePresets, support light/dark mode, theme a
  widget or app for a specific customer, or fix hard-coded colours that ignore the
  brand. The rule: use theme tokens (text-primary, bg-card, rounded-lg), never
  hard-coded colours.
---

# White-label a client UI with the toolkit theming system

Every consultancy build wears a different client's brand. The toolkit ships a
**CSS-variable token system** so you flip **one switch** — a `ThemeProvider` with
a brand theme — and every primitive (`Card`, `Button`, `Badge`, `bg-card`,
`text-primary`, `rounded-lg`) re-skins. Widgets authored to the rules
(tokens, never hard-coded colours) inherit the brand **for free**.

**Ground truth:** the [white-labeling guide](../../../docs/guides/white-labeling.md)
(full token table + wiring) and the brand switcher in
[`examples/widget-playground/App.tsx`](../../../examples/widget-playground/App.tsx).
The exports live on the **root** barrel (`createTheme`, `ThemeProvider`,
`useTheme`, `themePresets`) — React + DOM only, no host required.

## The contract: CSS variables are the surface

The design system is built on CSS custom properties in
[`packages/ui/src/globals.css`](../../../packages/ui/src/globals.css): `:root`
holds the light tokens, `.dark` the dark ones. **Setting those variables on any
scope re-skins everything below it.** `createTheme` exposes the brand-relevant
subset as plain fields:

| Token field                     | CSS variable                     | Skins                                 |
| ------------------------------- | -------------------------------- | ------------------------------------- |
| `primary` / `primaryForeground` | `--primary` / `-fg`              | Brand colour (buttons, accents)       |
| `accent` / `accentForeground`   | `--accent` / `-fg`               | Subtle highlights, hover states       |
| `background` / `foreground`     | `--background` / `-fg`           | Page surface + default text           |
| `card` / `cardForeground`       | `--card` / `-fg`                 | Card / panel surface                  |
| `border` / `ring`               | `--border` / `--ring`            | Dividers, outlines / focus rings      |
| `radius`                        | `--radius`                       | Corner roundness (drives `rounded-*`) |
| `fontSans` / `fontHeading`      | `--font-sans` / `--font-heading` | Typography                            |

Every field is optional — a theme overrides only what it cares about and inherits
the rest. Colours accept any CSS colour string; the toolkit palette is authored in
`oklch`, so prefer it.

## Step 1 — Define the brand theme (or fork a preset)

`createTheme` is pure: it maps the curated fields onto the real CSS variable names
and returns a serializable `ThemeDefinition`.

```ts
import { createTheme } from "@miragon/mcp-toolkit-ui"

export const acme = createTheme(
  {
    primary: "oklch(0.55 0.2 264)", // brand blue
    primaryForeground: "oklch(0.985 0 0)",
    accent: "oklch(0.95 0.03 264)",
    ring: "oklch(0.55 0.2 264)",
    radius: "0.5rem",
  },
  {
    // Dark-mode overrides, layered on the toolkit's `.dark` defaults:
    dark: { primary: "oklch(0.7 0.16 264)", primaryForeground: "oklch(0.18 0.02 264)" },
  },
)
```

Or skip authoring and start from a built-in preset —
[`themePresets.miragon` / `.violet` / `.emerald`](../../../packages/ui/src/theme/presets.ts)
(they double as fork-able examples).

## Step 2 — Apply it with `ThemeProvider`

`ThemeProvider` renders a wrapper carrying the theme's CSS variables as inline
`style` (overriding `:root`) and toggles `.dark` on that scope. Because the class
is scoped to the wrapper (not `<html>`), two differently themed subtrees coexist
on one page.

```tsx
import { ThemeProvider } from "@miragon/mcp-toolkit-ui"

function ClientApp() {
  return (
    <ThemeProvider theme={acme} mode="system">
      {/* Every widget below now wears the acme brand. */}
      <YourWidget />
    </ThemeProvider>
  )
}
```

## Step 3 — Light / dark

`mode` is `"light"` (default), `"dark"`, or `"system"` (tracks
`prefers-color-scheme`, SSR-safe). A host that already knows the scheme passes it
straight through; read the active theme anywhere below with `useTheme()`:

```tsx
import { ThemeProvider, useTheme } from "@miragon/mcp-toolkit-ui"
import { useHostBridge } from "@miragon/mcp-toolkit-ui/app"

function ThemedWidget() {
  const host = useHostBridge() // host.theme is "light" | "dark"
  return (
    <ThemeProvider theme={acme} mode={host.theme ?? "system"}>
      <YourWidget />
    </ThemeProvider>
  )
}
// const { theme, mode, resolvedMode } = useTheme()  // resolvedMode resolves "system"
```

## The one rule for widgets: tokens, never hard-coded colours

A theme only reaches a widget that **reads tokens**. Token classes resolve to the
active theme's CSS variables; raw colours ignore the brand a `ThemeProvider` sets.

```tsx
// GOOD — inherits the client's brand and light/dark automatically:
<div className="bg-card text-card-foreground rounded-lg border">…</div>
<Button>Primary</Button> // already uses --primary
<span className="text-primary">accent</span>

// BAD — hard-coded, white-labeling breaks (the brand switcher can't reach these):
<div style={{ background: "#fff", color: "#111" }}>…</div>
<button className="bg-blue-600 rounded-[10px]">…</button>
```

Use the [tone system](../../../docs/reference/components.md) (`ToneVariant` +
`LivePill` / `CountPill` / `TONE_*`) for status colour rather than picking hexes.
This is exactly what makes [`TasksBoard`](../../../examples/modules/tasks/widgets/TasksBoard.tsx)
re-skin cleanly across brands.

## See it live

The [widget playground](../../../docs/guides/developing-widgets-in-isolation.md) has
a brand + light/dark switcher above the preview — pick a preset and watch the same
widget re-skin. The switcher is just the `ThemeProvider` wrapping the preview; read
[`examples/widget-playground/App.tsx`](../../../examples/widget-playground/App.tsx)
for the exact wiring. Run it:

```sh
pnpm --filter @miragon/mcp-toolkit-examples run dev:widget-playground
```

## See also

- [`build-mcp-widget`](../build-mcp-widget/SKILL.md) — why widgets must use tokens.
- [White-labeling guide](../../../docs/guides/white-labeling.md) — the full token
  table, scoped subtrees, and the `host.theme` hand-off.
