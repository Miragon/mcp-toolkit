# White-label a client UI in 5 minutes

Every consultancy build needs to wear a different client's brand. The toolkit
ships a token system so you flip **one switch** — a `ThemeProvider` with a
brand theme — and every primitive (`Card`, `Button`, `Badge`, `bg-card`,
`text-primary`, `rounded-lg`) re-skins. Widgets that follow the
[authoring rules](../../.claude/skills/build-mcp-widget/SKILL.md) (tokens, never
hard-coded colours) inherit the client's look for free.

## The theming contract: CSS variables are the surface

The toolkit's design system is built on CSS custom properties defined in
[`packages/ui/src/globals.css`](../../packages/ui/src/globals.css). `:root` holds
the light tokens, `.dark` the dark ones, and Tailwind's `@theme inline` maps
`--color-*` onto them. **These variables are the public theming surface** — set
them on any scope and everything below re-skins.

`createTheme` exposes a curated, brand-relevant subset as plain fields:

| Token field                     | CSS variable                     | What it skins                         |
| ------------------------------- | -------------------------------- | ------------------------------------- |
| `primary` / `primaryForeground` | `--primary` / `-fg`              | Brand colour (buttons, accents)       |
| `accent` / `accentForeground`   | `--accent` / `-fg`               | Subtle highlights, hover states       |
| `background` / `foreground`     | `--background` / `-fg`           | Page surface + default text           |
| `card` / `cardForeground`       | `--card` / `-fg`                 | Card/panel surface                    |
| `border`                        | `--border`                       | Dividers, outlines                    |
| `ring`                          | `--ring`                         | Focus rings                           |
| `radius`                        | `--radius`                       | Corner roundness (drives `rounded-*`) |
| `fontSans` / `fontHeading`      | `--font-sans` / `--font-heading` | Typography                            |

Every field is optional: a theme overrides only what it cares about and inherits
the rest from the toolkit defaults. Colours accept any CSS colour string
(`oklch(...)`, `#rrggbb`, `hsl(...)`); the toolkit's own palette is authored in
`oklch`, so prefer it for consistency. Variables outside this subset (`--popover`,
`--chart-*`, `--sidebar-*`) are still themeable — set them in CSS when a client
needs them — but are not part of the brand essentials.

## Step 1 — Define the brand theme

`createTheme` is pure: it maps the curated fields onto the real CSS variable
names and returns a serializable `ThemeDefinition`.

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
    // Dark-mode overrides, layered on top of the toolkit's `.dark` defaults.
    dark: { primary: "oklch(0.7 0.16 264)", primaryForeground: "oklch(0.18 0.02 264)" },
  },
)
```

Or skip authoring entirely and start from a built-in preset
(`themePresets.miragon`, `.violet`, `.emerald`) — they double as fork-able
examples.

## Step 2 — Apply it with `ThemeProvider`

`ThemeProvider` renders a wrapper carrying the theme's CSS variables as inline
`style` (overriding `:root`) and toggles the `.dark` class on that scope. It uses
only React + the DOM — no host required — so it ships from the **root** barrel
and works in a standalone app, a host, or SSR alike.

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

Because the `.dark` class is scoped to the wrapper (not `<html>`), two differently
themed subtrees coexist on one page — handy for a brand gallery.

## Step 3 — Light / dark

`mode` is `"light"` (default), `"dark"`, or `"system"` (tracks
`prefers-color-scheme` live, SSR-safe). A host that already knows the colour
scheme can pass it straight through:

```tsx
import { useHostBridge } from "@miragon/mcp-toolkit-ui/app"
import { ThemeProvider } from "@miragon/mcp-toolkit-ui"

function ThemedWidget() {
  const host = useHostBridge() // HostBridge.theme is "light" | "dark"
  return (
    <ThemeProvider theme={acme} mode={host.theme ?? "system"}>
      {/* … */}
    </ThemeProvider>
  )
}
```

Read the active theme/mode anywhere below with `useTheme()` — it returns
`{ theme, mode, resolvedMode }`, where `resolvedMode` is `"system"` resolved to
`"light"` | `"dark"`.

## See it live

The [widget playground](./developing-widgets-in-isolation.md) has a brand +
light/dark switcher above the preview: pick a preset and watch the same widget
re-skin across client brands. The switcher is the `ThemeProvider` wrapping the
preview — read
[`examples/widget-playground/App.tsx`](../../examples/widget-playground/App.tsx)
for the exact wiring.

## See also

- [Component reference](../reference/components.md) — `createTheme`,
  `ThemeProvider`, `useTheme`, `themePresets` with props and "when to use".
- [`build-mcp-widget` skill](../../.claude/skills/build-mcp-widget/SKILL.md) — why
  widgets must use tokens, not hard-coded colours, to inherit the brand.
- [Layered adoption](../concepts/layered-adoption.md) — theming is part of the
  primitives layer, available at every adoption level.
