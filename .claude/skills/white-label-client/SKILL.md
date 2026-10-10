---
name: white-label-client
description: >-
  White-label a client UI with the @miragon/mcp-toolkit theming system. Use when
  asked to "re-brand"/"white-label" a UI, apply a client's brand colours, set up
  createTheme / ThemeProvider, support light/dark mode, theme a widget or app for
  a specific customer, or fix hard-coded colours that ignore the brand. The rule:
  use role tokens (bg-primary, text-link, bg-card, rounded-md, the TONE_* maps),
  never hard-coded colours.
---

# White-label a client UI with the toolkit theming system

The toolkit renders in the **Miragon theme** by default. Every consultancy build
that wears a different client's brand flips **one switch**: it overrides the
**role tokens**, in CSS or with a `ThemeProvider`, and every primitive (`Card`,
`Button`, `Badge`, `bg-card`, `text-link`, `rounded-md`) re-skins. Widgets
authored to the rules (role tokens, never hard-coded colours) inherit the brand
**for free**. A brand needs no toolkit release.

**Ground truth:** the [white-labeling guide](../../../docs/guides/white-labeling.md)
(full role table, CSS path, mode rules) and the brand switcher in
[`examples/widget-playground/App.tsx`](../../../examples/widget-playground/App.tsx).
The exports live on the **root** barrel (`createTheme`, `ThemeProvider`,
`useTheme`, `resolveThemeVars`, `ROLE_TOKENS`, `usePortalContainer`), React +
DOM only, no host required.

## The contract: role variables are the surface

[`packages/ui/src/theme.css`](../../../packages/ui/src/theme.css) has three layers:
the vendored Miragon `--cd-*` tokens (never touch), the **roles** (light AND dark,
each pointing at a `--cd-*` token) and Tailwind's utility mapping. **Override
roles only.** The contract (`ROLE_TOKENS`):

| Roles                                                                      | Skins                            |
| -------------------------------------------------------------------------- | -------------------------------- |
| `--background` `--card` `--popover` `--muted` `--secondary`                | Surfaces                         |
| `--foreground` `--muted-foreground`                                        | Text                             |
| `--border` `--input`                                                       | Lines; input borders (3:1)       |
| `--primary` `--primary-foreground` `--primary-hover`                       | Primary button                   |
| `--link` `--ring` `--focus`                                                | Links; focus ring (opaque, 3:1)  |
| `--<tone>` `--<tone>-soft` `--<tone>-ink` (success, warning, danger, info) | Status colour, tint, TEXT colour |
| `--destructive`                                                            | Destructive action fill          |
| `--radius-sm/md/lg/pill`, `--shadow-1/2/3`, `--scrim`                      | Shape, elevation, backdrop       |
| `--motion-fast/base/slow`, `--ease`, `--font-sans`, `--font-mono`          | Motion, typography               |

`createTheme` has one optional field per role (`primary`, `primaryHover`, `link`,
`focus`, `muted`, `mutedForeground`, `input`, `dangerInk`, `radiusMd`, `fontMono`,
…). Keep the brand accessible: text 4.5:1, focus ring and input border 3:1, in
both modes.

## Step 1: Define the brand theme

```ts
import { createTheme } from "@miragon/mcp-toolkit-ui"

export const acme = createTheme(
  { primary: "#0f766e", primaryHover: "#115e59", link: "#0f766e", focus: "#0f766e" },
  // Dark overrides, layered on the toolkit's dark roles:
  { dark: { link: "#5eead4", focus: "#5eead4" } },
)
```

`themePresets` (`.miragon`, `.violet`, `.emerald`) are fork-able examples.

## Step 2: Apply it

`ThemeProvider` puts the theme's variables on a wrapper and sets `.dark` /
`data-theme-mode` on that scope. Dialogs, sheets and select menus opened inside
portal into the scope, so they keep the brand and mode.

```tsx
import { ThemeProvider } from "@miragon/mcp-toolkit-ui"

function ClientApp() {
  return (
    <ThemeProvider theme={acme} mode="system">
      <YourWidget />
    </ThemeProvider>
  )
}
```

For a whole app, overriding the roles in CSS after the toolkit import works as
well; declare each colour role in the light AND the dark selector block (see the
guide).

## Step 3: Light / dark

`mode` is `"light"` (default), `"dark"`, or `"system"`. Without a provider the
toolkit follows the document (`.dark` or `data-theme="dark"`). Dark mode gets
the toolkit's dark roles plus the theme's dark and mode-invariant tokens (button
colour, radii, fonts), never its light surfaces (`resolveThemeVars`).

```tsx
import { ThemeProvider } from "@miragon/mcp-toolkit-ui"
import { useHostBridge } from "@miragon/mcp-toolkit-ui/app"

function ThemedWidget() {
  const host = useHostBridge() // host.theme is "light" | "dark"
  return (
    <ThemeProvider theme={acme} mode={host.theme ?? "system"}>
      <YourWidget />
    </ThemeProvider>
  )
}
```

## The one rule for widgets: role tokens, never hard-coded colours

A theme only reaches a widget that **reads role tokens**. The design-system gate
(`examples/test/design-system.test.ts`) fails on palette utilities, raw colours,
status-as-text and translucent text.

```tsx
// GOOD: inherits the client's brand and light/dark automatically
<div className="bg-card text-card-foreground rounded-md border">…</div>
<Button>Primary</Button> // already uses --primary
<a className="text-link">details</a>
<span className={TONE_SOFT.danger}>3 failed</span>

// BAD: hard-coded or unreadable
<div style={{ background: "#fff", color: "#111" }}>…</div>
<button className="bg-blue-600 rounded-[10px]">…</button>
<span className="text-success">Done</span>      // 1.67:1 on white: use the ink + a dot
<span className="text-muted-foreground/60">…</span> // translucent text drops below 4.5:1
```

Use the [tone system](../../../docs/reference/components.md#tone-tokens)
(`ToneVariant` + `LivePill` / `CountPill` / `TONE_*`) for status: colour as a dot,
icon or border, text in the tone's ink. This is what makes
[`TasksBoard`](../../../examples/modules/tasks/widgets/TasksBoard.tsx) re-skin
cleanly across brands.

## See it live

The [widget playground](../../../docs/guides/developing-widgets-in-isolation.md) has
a brand + light/dark switcher above the preview: compare the Miragon default with
a customer preset. Run it:

```sh
pnpm --filter @miragon/mcp-toolkit-examples run dev:widget-playground
```

## See also

- [`build-mcp-widget`](../build-mcp-widget/SKILL.md): why widgets must use role tokens.
- [White-labeling guide](../../../docs/guides/white-labeling.md): the full role
  table, the CSS path, scoped subtrees and the `host.theme` hand-off.
