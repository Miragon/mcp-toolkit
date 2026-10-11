import fs from "node:fs"
import path from "node:path"
import { TOOLKIT_MESSAGES } from "@miragon/mcp-toolkit-ui"
import { describe, expect, it } from "vitest"
import { REPO_ROOT } from "./helpers/fitness-probe.js"

/**
 * The docs name toolkit controls by their label ("the **Edit view** button").
 * When a label changes in the catalog, the docs keep the old one silently (the
 * tour said "**Build**" a release after the button became "Edit view"). This
 * test reads every bold label the docs put in front of a control noun and
 * requires it in the toolkit's English catalog (`messages-en.ts`), unless it
 * names a control of another product (the mcp-use inspector, a host).
 */

const DOC_ROOTS = ["docs", "README.md", "examples", "templates/minimal-server/README.md"]
const SKIP_DIRS = new Set(["node_modules", ".vitepress", "dist", "generated"])

/** "**Label** button", "**Label** tab", … — a bold label in front of a control noun. */
const LABEL_REF =
  /\*\*([^*\n]{1,40})\*\*\s+(?:button|affordance|tab|toggle|link|menu|switch|chip)s?\b/g

/** Labels of controls the toolkit does not render, with whose they are. */
const FOREIGN_LABELS: Record<string, string> = {
  Tools: "the mcp-use inspector's tools tab",
  Execute: "the mcp-use inspector's run button",
}

function listMarkdown(rel: string): string[] {
  const abs = path.join(REPO_ROOT, rel)
  if (!fs.statSync(abs).isDirectory()) return rel.endsWith(".md") ? [rel] : []
  return fs
    .readdirSync(abs, { withFileTypes: true })
    .filter((e) => !SKIP_DIRS.has(e.name))
    .flatMap((e) => listMarkdown(path.join(rel, e.name)))
}

/** Every plain string in the English catalog (functions render with params; skipped). */
const catalogLabels = new Set(
  Object.values(TOOLKIT_MESSAGES.en).flatMap((section) =>
    Object.values(section as Record<string, unknown>).filter(
      (v): v is string => typeof v === "string",
    ),
  ),
)

function labelRefs(markdown: string): string[] {
  // A bold lead-in ("**When to use:** …") is a heading, not a label.
  return [...markdown.matchAll(LABEL_REF)].map((m) => m[1] ?? "").filter((l) => !l.endsWith(":"))
}

describe("UI labels quoted in the docs", () => {
  const files = DOC_ROOTS.flatMap(listMarkdown).sort()

  it("scans the tour and the guides", () => {
    expect(files).toContain("docs/playground/tour.md")
    expect(files).toContain("docs/guides/building-dashboards.md")
  })

  it("names toolkit controls by their current catalog label", () => {
    const stale = files.flatMap((file) =>
      labelRefs(fs.readFileSync(path.join(REPO_ROOT, file), "utf8"))
        .filter((label) => !(label in FOREIGN_LABELS) && !catalogLabels.has(label))
        .map((label) => `${file}: **${label}**`),
    )
    expect(
      stale,
      "A doc names a control by a label the toolkit no longer renders. Use the label " +
        "from packages/ui/src/locale/messages-en.ts (or list a foreign control in FOREIGN_LABELS).",
    ).toEqual([])
  })

  it("reads labels only in front of a control noun (self-test)", () => {
    expect(labelRefs("carries a **Build** affordance and a **Pipeline** tab")).toEqual([
      "Build",
      "Pipeline",
    ])
    expect(labelRefs("the **recommended default** path; **two** widgets")).toEqual([])
    expect(catalogLabels.has("Edit view")).toBe(true)
  })
})
