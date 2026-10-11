import { useMemo, useState } from "react"
import { WidgetFixtureHost, type HostActionLog } from "@miragon/mcp-toolkit-ui/app"
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  LocaleProvider,
  ScrollArea,
  Separator,
  Switch,
  ThemeProvider,
  themePresets,
  type ThemeDefinition,
} from "@miragon/mcp-toolkit-ui"
import { STORIES, type Story } from "./stories.js"

/**
 * The white-label themes the preview can be skinned with. `null` is the
 * toolkit's own default, the Miragon theme (no `ThemeProvider` override), so
 * you can compare a customer brand against the baseline.
 */
const DEFAULT_THEME_OPTION: { id: string; label: string; theme: ThemeDefinition | null } = {
  id: "default",
  label: "Miragon (default)",
  theme: null,
}

const THEME_OPTIONS: { id: string; label: string; theme: ThemeDefinition | null }[] = [
  DEFAULT_THEME_OPTION,
  { id: "emerald", label: "Emerald", theme: themePresets.emerald },
]

/** The host languages the preview can simulate (the host's locale, BCP 47). */
const LANGUAGE_OPTIONS = [
  { id: "en-US", label: "English" },
  { id: "de-DE", label: "Deutsch" },
] as const

type HostLocale = (typeof LANGUAGE_OPTIONS)[number]["id"]

/** A labelled group of toggle buttons, one of them pressed. */
function ToggleGroup<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string
  options: readonly { id: T; label: string }[]
  value: T
  onChange: (id: T) => void
}) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap items-center gap-2">
      <span className="text-muted-foreground text-sm font-medium">{label}</span>
      <div className="flex flex-wrap gap-1">
        {options.map((option) => (
          <Button
            key={option.id}
            type="button"
            size="sm"
            variant={option.id === value ? "default" : "outline"}
            aria-pressed={option.id === value}
            onClick={() => onChange(option.id)}
          >
            {option.label}
          </Button>
        ))}
      </div>
    </div>
  )
}

/**
 * The host the preview simulates: the brand (a {@link ThemeProvider} theme),
 * its colour scheme and its language. Brand and Dark re-skin the same widget;
 * Dark and the language are also what the widget is told about its host.
 */
function HostSwitcher({
  themeId,
  onThemeChange,
  dark,
  onDarkChange,
  locale,
  onLocaleChange,
}: {
  themeId: string
  onThemeChange: (id: string) => void
  dark: boolean
  onDarkChange: (dark: boolean) => void
  locale: HostLocale
  onLocaleChange: (locale: HostLocale) => void
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
      <ToggleGroup label="Brand" options={THEME_OPTIONS} value={themeId} onChange={onThemeChange} />
      <ToggleGroup
        label="Language"
        options={LANGUAGE_OPTIONS}
        value={locale}
        onChange={onLocaleChange}
      />
      <label className="flex items-center gap-2 text-sm">
        <Switch checked={dark} onCheckedChange={onDarkChange} />
        <span className="text-muted-foreground font-medium">Dark host</span>
      </label>
    </div>
  )
}

/** A timestamped host-action entry for the activity log. */
interface LogEntry {
  at: string
  action: HostActionLog
}

function formatAction(action: HostActionLog): string {
  switch (action.type) {
    case "callTool":
      return `callTool(${action.name}, ${JSON.stringify(action.args)})`
    case "sendFollowUpMessage":
      return `sendFollowUpMessage(${JSON.stringify(action.prompt)})`
    case "openExternal":
      return `openExternal(${action.href})`
    case "requestDisplayMode":
      return `requestDisplayMode(${action.mode})`
    case "setWidgetState":
      return `setWidgetState(${JSON.stringify(action.state)})`
  }
}

const ACTION_VARIANT: Record<HostActionLog["type"], "default" | "secondary" | "outline"> = {
  callTool: "default",
  sendFollowUpMessage: "secondary",
  openExternal: "outline",
  requestDisplayMode: "outline",
  setWidgetState: "outline",
}

/** Below `md` the sidebar gives way to this select, so the editor keeps the width. */
function StorySelect({
  stories,
  activeId,
  onSelect,
}: {
  stories: Story[]
  activeId: string
  onSelect: (story: Story) => void
}) {
  return (
    <label className="flex flex-col gap-1 border-b px-4 py-3 text-sm md:hidden">
      <span className="text-muted-foreground font-medium">Widget</span>
      <select
        value={activeId}
        onChange={(e) => {
          const next = stories.find((s) => s.id === e.target.value)
          if (next) onSelect(next)
        }}
        className="border-input bg-background text-foreground focus-visible:ring-focus h-9 rounded-md border px-2 focus-visible:ring-2 focus-visible:outline-hidden"
      >
        {stories.map((s) => (
          <option key={s.id} value={s.id}>
            {s.label}
          </option>
        ))}
      </select>
    </label>
  )
}

/** Sidebar widget picker. Selecting a story resets the editor + logs. */
function StoryList({
  stories,
  activeId,
  onSelect,
}: {
  stories: Story[]
  activeId: string
  onSelect: (story: Story) => void
}) {
  return (
    <nav className="flex flex-col gap-1 p-3">
      <div className="text-muted-foreground px-2 pb-2 text-sm font-medium">Widgets</div>
      {stories.map((story) => {
        const active = story.id === activeId
        return (
          <button
            key={story.id}
            type="button"
            onClick={() => onSelect(story)}
            aria-current={active ? "true" : undefined}
            className={
              "group hover:bg-accent hover:text-accent-foreground focus-visible:ring-focus rounded-md px-3 py-2 text-left text-sm transition-colors focus-visible:ring-2 focus-visible:outline-hidden " +
              (active ? "bg-accent text-accent-foreground font-medium" : "text-muted-foreground")
            }
          >
            <div className="font-medium">{story.label}</div>
            {/* Quiet text on the --accent surface takes its foreground: dark
                --muted-foreground reaches only 3.66:1 on the 10 % lift. */}
            <div
              className={
                "group-hover:text-accent-foreground text-small mt-0.5 line-clamp-2 " +
                (active ? "text-accent-foreground" : "text-muted-foreground")
              }
            >
              {story.description}
            </div>
          </button>
        )
      })}
    </nav>
  )
}

export function App() {
  const [activeId, setActiveId] = useState(STORIES[0]?.id ?? "")
  const story = useMemo(() => STORIES.find((s) => s.id === activeId) ?? STORIES[0], [activeId])

  const [draft, setDraft] = useState(() => JSON.stringify(story?.data ?? {}, null, 2))
  const [modelContext, setModelContext] = useState<string | null>(null)
  const [log, setLog] = useState<LogEntry[]>([])
  const [themeId, setThemeId] = useState("default")
  const [dark, setDark] = useState(false)
  const [locale, setLocale] = useState<HostLocale>("en-US")

  const activeTheme = useMemo(
    () => THEME_OPTIONS.find((t) => t.id === themeId) ?? DEFAULT_THEME_OPTION,
    [themeId],
  )

  function selectStory(next: Story) {
    setActiveId(next.id)
    setDraft(JSON.stringify(next.data, null, 2))
    setModelContext(null)
    setLog([])
  }

  // Parse the editor on every keystroke. A parse error keeps the last valid
  // data on screen (so the preview doesn't flash) and surfaces the message.
  const parsed = useMemo<{ data: Record<string, unknown> | null; error: string | null }>(() => {
    try {
      const value = JSON.parse(draft) as unknown
      if (value === null || typeof value !== "object" || Array.isArray(value)) {
        return { data: null, error: "Top-level value must be a JSON object." }
      }
      return { data: value as Record<string, unknown>, error: null }
    } catch (err) {
      return { data: null, error: err instanceof Error ? err.message : String(err) }
    }
  }, [draft])

  const [lastValid, setLastValid] = useState<Record<string, unknown>>(story?.data ?? {})
  if (parsed.data && parsed.data !== lastValid) {
    // Render-phase commit of the latest valid parse — cheaper than an effect and
    // keeps the preview in lockstep with the editor without a cascading render.
    setLastValid(parsed.data)
  }

  if (!story) return null

  return (
    <div className="bg-background text-foreground flex h-screen w-full overflow-hidden">
      {/* Sidebar — widget selection */}
      <aside className="bg-sidebar hidden w-72 shrink-0 flex-col border-r md:flex">
        <div className="flex h-14 flex-col justify-center border-b px-4">
          <div className="text-sm leading-none font-semibold">Widget playground</div>
          <div className="text-muted-foreground text-small mt-0.5">
            Develop widgets against fixture data
          </div>
        </div>
        <ScrollArea className="flex-1">
          <StoryList stories={STORIES} activeId={story.id} onSelect={selectStory} />
        </ScrollArea>
      </aside>

      {/* Center — editor + live preview */}
      <main className="flex min-w-0 flex-1 flex-col">
        <StorySelect stories={STORIES} activeId={story.id} onSelect={selectStory} />
        <header className="flex h-14 items-center justify-between gap-3 border-b px-4 md:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <h1 className="truncate text-lg font-semibold">{story.label}</h1>
            <Badge variant="outline">Fixture</Badge>
          </div>
          <p className="text-muted-foreground hidden max-w-xl truncate text-sm md:block">
            {story.description}
          </p>
        </header>

        <ScrollArea className="flex-1">
          <div className="grid gap-6 p-4 md:p-6 lg:grid-cols-2">
            {/* Data editor */}
            <Card className="flex flex-col">
              <CardHeader>
                <CardTitle className="text-base">Fixture data</CardTitle>
                <CardDescription>
                  Edit the JSON the widget receives as <code>data</code> / <code>keys</code>. The
                  preview re-renders live.
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-1 flex-col gap-3">
                <textarea
                  aria-label="Fixture data (JSON)"
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  spellCheck={false}
                  className="border-input bg-muted/40 focus-visible:ring-ring text-small min-h-[280px] flex-1 resize-y rounded-md border p-3 font-mono leading-relaxed focus-visible:ring-2 focus-visible:outline-hidden"
                />
                {parsed.error ? (
                  <Alert variant="danger">
                    <AlertTitle>Invalid JSON</AlertTitle>
                    <AlertDescription>{parsed.error}</AlertDescription>
                  </Alert>
                ) : (
                  <p className="text-muted-foreground text-small">
                    Valid JSON. The preview shows the latest edit.
                  </p>
                )}
              </CardContent>
            </Card>

            {/* Live preview */}
            <Card className="flex flex-col">
              <CardHeader>
                <CardTitle className="text-base">Live preview</CardTitle>
                <CardDescription>
                  Rendered through <code>WidgetFixtureHost</code>, wrapped in a{" "}
                  <code>ThemeProvider</code> and a <code>LocaleProvider</code>. Switch the brand to
                  see the same widget re-skin, the language to read it in German, and Dark host to
                  render it on a dark host.
                </CardDescription>
                <div className="pt-2">
                  <HostSwitcher
                    themeId={activeTheme.id}
                    onThemeChange={setThemeId}
                    dark={dark}
                    onDarkChange={setDark}
                    locale={locale}
                    onLocaleChange={setLocale}
                  />
                </div>
              </CardHeader>
              <CardContent className="flex-1">
                {/* The ThemeProvider scopes the chosen brand's CSS variables and
                    dark class to just the preview, so the playground chrome
                    around it keeps the default theme. */}
                <ThemeProvider
                  theme={activeTheme.theme ?? undefined}
                  mode={dark ? "dark" : "light"}
                  className="rounded-lg border border-dashed p-4"
                >
                  {/* The host's language: the LocaleProvider gives it to the widget's
                      own text (`useLocale()`), as an app does with the host locale;
                      `globals.locale` is what the toolkit's own text follows. */}
                  <LocaleProvider locale={locale}>
                    <WidgetFixtureHost
                      key={story.id}
                      widget={story.widget}
                      data={lastValid}
                      dataType={story.dataType}
                      tools={story.tools}
                      // The Dark switch is the host's colour scheme: it styles the
                      // preview AND is what `useHostBridge().theme` reports.
                      globals={{ theme: dark ? "dark" : "light", locale }}
                      onModelContext={setModelContext}
                      onHostAction={(action) =>
                        setLog((prev) =>
                          [{ at: new Date().toLocaleTimeString(), action }, ...prev].slice(0, 50),
                        )
                      }
                    />
                  </LocaleProvider>
                </ThemeProvider>
              </CardContent>
            </Card>
          </div>

          {/* Model context + activity log */}
          <div className="grid gap-6 px-4 pb-6 md:px-6 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Model context</CardTitle>
                <CardDescription>
                  What the model would see: the serialized <code>&lt;ModelContext&gt;</code> the
                  widget reports.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {modelContext ? (
                  <pre className="bg-muted/40 text-small overflow-x-auto rounded-md border p-3 font-mono whitespace-pre-wrap">
                    {modelContext}
                  </pre>
                ) : (
                  <p className="text-muted-foreground text-sm">
                    This widget reports no model context.
                  </p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Host activity</CardTitle>
                <CardDescription>
                  Tool calls and host actions the widget triggered, newest first.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {log.length === 0 ? (
                  <p className="text-muted-foreground text-sm">No host actions yet.</p>
                ) : (
                  <ul className="flex flex-col gap-2">
                    {log.map((entry, i) => (
                      <li key={i} className="flex items-start gap-2">
                        <Badge variant={ACTION_VARIANT[entry.action.type]}>
                          {entry.action.type}
                        </Badge>
                        <code className="text-muted-foreground text-small min-w-0 flex-1 break-all">
                          {formatAction(entry.action)}
                        </code>
                        <span className="text-muted-foreground text-small shrink-0">
                          {entry.at}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </div>
          <Separator />
          <p className="text-muted-foreground text-small p-4 md:p-6">
            Add a widget to this playground by appending a <code>Story</code> to{" "}
            <code>stories.ts</code>. No host or backend needed.
          </p>
        </ScrollArea>
      </main>
    </div>
  )
}
