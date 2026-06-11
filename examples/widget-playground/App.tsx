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
 * toolkit's own default tokens (no `ThemeProvider` override), so you can compare
 * a brand against the baseline. The rest come straight from `themePresets`.
 */
const DEFAULT_THEME_OPTION: { id: string; label: string; theme: ThemeDefinition | null } = {
  id: "default",
  label: "Default",
  theme: null,
}

const THEME_OPTIONS: { id: string; label: string; theme: ThemeDefinition | null }[] = [
  DEFAULT_THEME_OPTION,
  { id: "miragon", label: "Miragon", theme: themePresets.miragon },
  { id: "violet", label: "Violet", theme: themePresets.violet },
  { id: "emerald", label: "Emerald", theme: themePresets.emerald },
]

/**
 * Brand + light/dark switcher. Drives the {@link ThemeProvider} that wraps the
 * live preview, so the same widget can be seen re-skinning across client brands.
 */
function ThemeSwitcher({
  activeId,
  onSelect,
  dark,
  onDarkChange,
}: {
  activeId: string
  onSelect: (id: string) => void
  dark: boolean
  onDarkChange: (dark: boolean) => void
}) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <span className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
        Brand
      </span>
      <div className="flex flex-wrap gap-1">
        {THEME_OPTIONS.map((option) => (
          <Button
            key={option.id}
            type="button"
            size="sm"
            variant={option.id === activeId ? "default" : "outline"}
            onClick={() => onSelect(option.id)}
          >
            {option.label}
          </Button>
        ))}
      </div>
      <Separator orientation="vertical" className="h-5" />
      <label className="flex items-center gap-2 text-sm">
        <Switch checked={dark} onCheckedChange={onDarkChange} aria-label="Toggle dark mode" />
        <span className="text-muted-foreground">Dark</span>
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
      <div className="text-muted-foreground px-2 pb-2 text-xs font-semibold tracking-wide uppercase">
        Widgets
      </div>
      {stories.map((story) => {
        const active = story.id === activeId
        return (
          <button
            key={story.id}
            type="button"
            onClick={() => onSelect(story)}
            aria-current={active ? "true" : undefined}
            className={
              "hover:bg-accent hover:text-accent-foreground focus-visible:ring-ring rounded-md px-3 py-2 text-left text-sm transition-colors focus-visible:ring-2 focus-visible:outline-none " +
              (active ? "bg-accent text-accent-foreground font-medium" : "text-foreground/80")
            }
          >
            <div className="font-medium">{story.label}</div>
            <div className="text-muted-foreground mt-0.5 line-clamp-2 text-xs">
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
      <aside className="bg-sidebar flex w-72 shrink-0 flex-col border-r">
        <div className="flex h-14 items-center gap-2 border-b px-4">
          <div className="bg-primary text-primary-foreground flex h-7 w-7 items-center justify-center rounded-md text-xs font-bold">
            UI
          </div>
          <div>
            <div className="text-sm leading-none font-semibold">Widget Playground</div>
            <div className="text-muted-foreground mt-0.5 text-xs">Storybook for MCP widgets</div>
          </div>
        </div>
        <ScrollArea className="flex-1">
          <StoryList stories={STORIES} activeId={story.id} onSelect={selectStory} />
        </ScrollArea>
      </aside>

      {/* Center — editor + live preview */}
      <main className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 items-center justify-between border-b px-6">
          <div className="flex items-center gap-3">
            <h1 className="text-lg font-semibold">{story.label}</h1>
            <Badge variant="outline">fixture</Badge>
          </div>
          <p className="text-muted-foreground hidden max-w-xl truncate text-sm md:block">
            {story.description}
          </p>
        </header>

        <ScrollArea className="flex-1">
          <div className="grid gap-6 p-6 lg:grid-cols-2">
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
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  spellCheck={false}
                  className="border-input bg-muted/40 focus-visible:ring-ring min-h-[280px] flex-1 resize-y rounded-md border p-3 font-mono text-xs leading-relaxed focus-visible:ring-2 focus-visible:outline-none"
                />
                {parsed.error ? (
                  <Alert variant="destructive">
                    <AlertTitle>Invalid JSON</AlertTitle>
                    <AlertDescription>{parsed.error}</AlertDescription>
                  </Alert>
                ) : (
                  <p className="text-muted-foreground text-xs">
                    Valid JSON — preview reflects the latest edit.
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
                  <code>ThemeProvider</code> — switch the brand to see the same widget re-skin.
                </CardDescription>
                <div className="pt-2">
                  <ThemeSwitcher
                    activeId={activeTheme.id}
                    onSelect={setThemeId}
                    dark={dark}
                    onDarkChange={setDark}
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
                  <WidgetFixtureHost
                    key={story.id}
                    widget={story.widget}
                    data={lastValid}
                    dataType={story.dataType}
                    tools={story.tools}
                    onModelContext={setModelContext}
                    onHostAction={(action) =>
                      setLog((prev) =>
                        [{ at: new Date().toLocaleTimeString(), action }, ...prev].slice(0, 50),
                      )
                    }
                  />
                </ThemeProvider>
              </CardContent>
            </Card>
          </div>

          {/* Model context + activity log */}
          <div className="grid gap-6 px-6 pb-6 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Model context</CardTitle>
                <CardDescription>
                  What the model would see — the serialized <code>&lt;ModelContext&gt;</code> the
                  widget reports.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {modelContext ? (
                  <pre className="bg-muted/40 overflow-x-auto rounded-md border p-3 font-mono text-xs whitespace-pre-wrap">
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
                        <code className="text-muted-foreground min-w-0 flex-1 text-xs break-all">
                          {formatAction(entry.action)}
                        </code>
                        <span className="text-muted-foreground/60 shrink-0 text-[10px]">
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
          <p className="text-muted-foreground p-6 text-xs">
            Add a widget to this playground by appending a <code>Story</code> to{" "}
            <code>stories.ts</code> — no host, no backend.
          </p>
        </ScrollArea>
      </main>
    </div>
  )
}
