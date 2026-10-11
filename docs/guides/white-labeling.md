# White-label a client UI in 5 minutes

The toolkit renders in the **Miragon theme** by default: its role tokens point
at the Miragon corporate-design tokens. Every consultancy build that needs a
different client's brand flips **one switch**: it overrides the role tokens,
in CSS or with a `ThemeProvider`, and every primitive (`Card`, `Button`,
`Badge`, `bg-card`, `text-link`, `rounded-md`) re-skins. Widgets that follow the
[authoring rules](../../.claude/skills/build-mcp-widget/SKILL.md) (role tokens,
never hard-coded colours) inherit the client's look for free. A brand needs no
toolkit release.

## The theming contract: three layers

The design system lives in [`packages/ui/src/theme.css`](../../packages/ui/src/theme.css):

1. **`--cd-*`**: the Miragon corporate-design tokens, vendored unchanged in
   `theme/cd-tokens.generated.css`. Never override or edit them.
2. **Roles**: the variables components use, light AND dark, each pointing at a
   `--cd-*` token. **These are the public theming surface**: set them on any
   scope and everything below re-skins.
3. **Utilities**: Tailwind's `@theme` maps `bg-primary`, `text-link`,
   `ring-focus`, `rounded-md`, `shadow-2` … onto the roles.

The role-token contract (`ROLE_TOKENS`):

| Roles                                                                        | What they skin                                                        |
| ---------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| `--background` `--card` `--popover` `--muted` `--secondary`                  | Surfaces                                                              |
| `--foreground` `--muted-foreground`                                          | Text (secondary text keeps 4.5:1 on `--muted`)                        |
| `--border` `--input`                                                         | Decorative lines; input borders (3:1 on their surface)                |
| `--primary` `--primary-foreground` `--primary-hover`                         | Primary button fill, its text, its hover fill                         |
| `--link` `--ring` `--focus`                                                  | Links and interactive text; focus ring (opaque, 3:1)                  |
| `--<tone>` `--<tone>-soft` `--<tone>-ink` for success, warning, danger, info | A status: its colour (fill, dot, border, icon), tint, and TEXT colour |
| `--destructive` (+ `--destructive-foreground`)                               | Destructive action fill and its text (white)                          |
| `--radius-sm` `--radius-md` `--radius-lg` `--radius-pill`                    | Badges and chips; buttons, inputs, cards, dialogs; panels; pills      |
| `--shadow-1` `--shadow-2` `--shadow-3` `--scrim`                             | Elevation; dialog and sheet backdrop                                  |
| `--motion-fast` `--motion-base` `--motion-slow` `--ease`                     | Transitions (reduced motion is always respected)                      |
| `--font-sans` `--font-mono`                                                  | Typography (Geist first; loading it is opt-in)                        |

Three rules keep a brand accessible:

- **Status is never text in its own colour.** A tone's words on a plain
  surface take its `-ink` role; light yellows and greens cannot carry text on
  white. Text on a tint is the foreground, with the tone on the rim, and
  figures (counts, KPI values, trends) always stay in the foreground: show the
  tone as a dot, icon or border next to the text (`TONE_*` maps).
- **Dark mode has no tinted fills.** In dark, `--<tone>-soft` is `transparent`
  and colour comes from the border, dot and ink.
- **A host may set only the neutral roles** (background, card, foreground,
  muted, border). Primary, link, focus, the status tones and the input border
  stay brand decisions.

## Path A: override the roles in CSS

The lightest path, and the one for a whole app: import the toolkit, then set
the roles. Override only roles, never `--cd-*`, never a component class.

```css
@import "@miragon/mcp-toolkit-ui/globals.css";

:root,
[data-theme-mode="light"] {
  --primary: #0f766e;
  --primary-hover: #115e59;
  --link: #0f766e;
  --focus: #0f766e;
  --ring: #0f766e;
  --radius-md: 6px;
}

.dark,
[data-theme="dark"],
[data-theme-mode="dark"] {
  --primary: #0f766e;
  --primary-hover: #115e59;
  --link: #5eead4;
  --focus: #5eead4;
  --ring: #5eead4;
}
```

Use the selectors of `theme.css` and declare every colour role you change in
BOTH blocks, the same value twice where it does not change with the mode
(`--primary`). Radii, shadows, motion and fonts are mode-independent: the light
block is enough. A light scope in a light document re-declares nothing, so a
plain `:root` brand reaches it; a light island inside a dark scope (diagram
paper, a light `ThemeProvider` in a dark host) re-declares the toolkit's light
roles, and only the `[data-theme-mode="light"]` selector carries your brand
into it. With both blocks, a dark `ThemeProvider` scope picks up your values
too, and no light colour leaks into dark.

Set the corner steps directly in CSS (`--radius-sm`, `--radius-md`,
`--radius-lg`): `rounded-sm/md/lg` read them, and a bare `--radius` reshapes
them only through a theme (`ThemeProvider`, `resolveThemeVars`,
`theme.toStyle()`).

## Path B: `createTheme` + `ThemeProvider`

`createTheme` is pure: it maps one field per role onto the real CSS variable
names and returns a serializable `ThemeDefinition`.

```ts
import { createTheme } from "@miragon/mcp-toolkit-ui"

export const acme = createTheme(
  {
    primary: "#0f766e",
    primaryHover: "#115e59",
    link: "#0f766e",
    focus: "#0f766e",
    radiusMd: "6px",
  },
  {
    // Dark-mode overrides, layered on the toolkit's dark roles.
    dark: { link: "#5eead4", focus: "#5eead4" },
  },
)
```

`ThemeProvider` renders a wrapper carrying the theme's variables as inline
`style` and sets the `.dark` class and `data-theme-mode` on that scope. It uses
only React + the DOM, so it ships from the **root** barrel and works in a
standalone app, a host, or SSR alike.

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

How the modes combine (`resolveThemeVars`):

- **Light**: the theme's tokens.
- **Dark**: the toolkit's dark roles, plus the theme's `dark` tokens, plus its
  **mode-invariant** light tokens (button colour, radii, fonts, motion). A light
  surface or text colour never leaks into a dark scope.
- **Legacy knobs fill the new roles** a theme leaves unset, in both modes:
  `primary` gives the hover fill (90 %) and the links, `ring` the focus ring,
  `radius` the sm/md/lg steps. A role the theme sets itself, in either mode, is
  never derived. Set `primaryHover`, `link` and `focus` (light and dark) for
  contrast you control; the presets do.
- A light scope inside a dark document stays light. A nested `ThemeProvider`
  without `theme` re-applies the enclosing theme in its own mode, so a light
  island keeps the brand.

Dialogs, sheets and select menus opened inside the scope portal into it, so
they wear the same theme and mode. Your own portals can do the same with
`usePortalContainer()`. The portal node is the wrapper's first child, an
empty `display: contents` element: `space-*`, `divide-*` and `last:` on the
wrapper see only your children.

Because the scope is the wrapper (not `<html>`), two differently themed
subtrees coexist on one page, handy for a brand gallery.

## Light / dark

`mode` is `"light"` (default), `"dark"`, or `"system"` (tracks
`prefers-color-scheme` live, SSR-safe). Without a `ThemeProvider` the toolkit
follows the document: a `.dark` class or `data-theme="dark"` on an ancestor
(SEP-1865 hosts and mcp-use write the latter on `<html>`). A host that knows
the colour scheme can pass it straight through:

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

Read the active theme/mode anywhere below with `useTheme()`. It returns
`{ theme, mode, resolvedMode }`, where `resolvedMode` is `"system"` resolved to
`"light"` | `"dark"`.

## Fonts

The font roles name Geist and Geist Mono first, then the host's font, then
the system stack; the toolkit loads no font. Either import
`@miragon/mcp-toolkit-ui/fonts.css` (your bundler self-hosts the files) or
serve the woff2 files yourself and inject `fontFaces({ baseUrl })`. The second
keeps MCP App views small: the files are fetched once and cached instead of
inlined into every view. Allow the origin in the view's CSP
`resourceDomains`. A brand font is just another `--font-sans`.

A SEP-1865 host sends its font as `--font-sans`/`--font-mono`, the same names
as the font roles, written inline on `<html>`; left alone, it would replace the
whole stack and Geist would never render. `McpToolkitApp` moves it to
`--host-font-sans`/`--host-font-mono`, the fallback slot after Geist. An app
with its own host-document layer does the same right after applying the host's
style variables:

```ts
import { adoptHostFontVariables } from "@miragon/mcp-toolkit-ui"

adoptHostFontVariables(document.documentElement.style, hostContext.styles?.variables)
```

## Icons

The kit's Lucide icons draw in `currentColor`, so they follow the roles: a
status icon takes the tone colour (`TONE_ICON`), never a fixed hue. The stroke
is not a role: `McpAppView` sets it once through `LucideProvider` (2.5, and 2 in
dense bars such as the view toolbar), so a brand sets no `stroke-width` in CSS.
Your own `lucide-react` icons follow it when your bundler dedupes
`lucide-react` with the toolkit's copy.

## See it live

The [widget playground](./developing-widgets-in-isolation.md) has a brand +
light/dark switcher above the preview: compare the Miragon default with a
customer preset and watch the same widget re-skin. The switcher is the
`ThemeProvider` wrapping the preview; read
[`examples/widget-playground/App.tsx`](../../examples/widget-playground/App.tsx)
for the exact wiring.

## See also

- [Component reference](../reference/components.md): `createTheme`,
  `ThemeProvider`, `useTheme`, `themePresets`, `CD_TOKENS`, `fontFaces`.
- [`build-mcp-widget` skill](../../.claude/skills/build-mcp-widget/SKILL.md): why
  widgets must use role tokens, not hard-coded colours, to inherit the brand.
- [Layered adoption](../concepts/layered-adoption.md): theming is part of the
  primitives layer, available at every adoption level.
