import { spawnSync } from "node:child_process"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { describe, expect, it } from "vitest"
import { githubSlug } from "../../docs/.vitepress/miragon/slug.mjs"
import { REPO_ROOT } from "./helpers/fitness-probe.js"

/**
 * The docs site wears the Miragon docs kit (skill docs-site of
 * Miragon/corporate-identity), vendored unchanged into docs/.vitepress/miragon/
 * with the CI's logos in docs/public/logo/. The kit's colours, contrast and
 * mapping are tested where the kit lives; this repo holds:
 *
 * - the copy: the kit's own check.mjs finds every file unchanged against its
 *   manifest (and the check is alive: an edit or a stray file fails it);
 * - the wiring: config.ts is `miragonDocs()` with this product's names, the
 *   theme is the kit's, the kit's pins, the workflows that run the check;
 * - the content: every `#anchor` link into a Markdown page hits a heading, by
 *   the GitHub slug rule the kit gives VitePress (so it hits on GitHub too);
 *   the URLs miragon.ai links keep their pages.
 */

const read = (rel: string) => fs.readFileSync(path.join(REPO_ROOT, rel), "utf8")
const KIT = "docs/.vitepress/miragon"
const config = read("docs/.vitepress/config.ts")
const manifest = JSON.parse(read(`${KIT}/manifest.json`)) as {
  version: string
  dateien: { pfad: string }[]
}

/** Runs a check.mjs with arguments; status and output. */
function runCheck(script: string, ...args: string[]) {
  const run = spawnSync(process.execPath, [script, ...args], { encoding: "utf8" })
  return { status: run.status, out: `${run.stdout}${run.stderr}` }
}

/** A throwaway repo root with a copy of the kit and the logos the manifest names. */
function copyOfTheKit(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "docs-kit-"))
  for (const rel of [...manifest.dateien.map((d) => d.pfad), `${KIT}/manifest.json`]) {
    fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true })
    fs.copyFileSync(path.join(REPO_ROOT, rel), path.join(root, rel))
  }
  return root
}

describe("docs kit: vendored unchanged", () => {
  it("check.mjs finds every kit file and logo unchanged", () => {
    const { status, out } = runCheck(path.join(REPO_ROOT, KIT, "check.mjs"))
    expect(out, out).toContain(`Kit ${manifest.version}:`)
    expect(status).toBe(0)
  })

  it("check.mjs fails on an edited kit file (the gate is alive)", () => {
    const root = copyOfTheKit()
    try {
      fs.appendFileSync(path.join(root, KIT, "theme/miragon.css"), "\n:root { --x: 0 }\n")
      const { status, out } = runCheck(path.join(root, KIT, "check.mjs"))
      expect(status).toBe(1)
      expect(out).toContain(`${KIT}/theme/miragon.css`)
    } finally {
      fs.rmSync(root, { recursive: true, force: true })
    }
  })

  it("check.mjs fails on a file that is not part of the kit", () => {
    const root = copyOfTheKit()
    try {
      fs.writeFileSync(path.join(root, KIT, "theme/custom.css"), ":root {}\n")
      const { status, out } = runCheck(path.join(root, KIT, "check.mjs"))
      expect(status).toBe(1)
      expect(out).toContain(`${KIT}/theme/custom.css`)
    } finally {
      fs.rmSync(root, { recursive: true, force: true })
    }
  })

  it("keeps no copy of the old theme next to the kit", () => {
    expect(fs.readdirSync(path.join(REPO_ROOT, "docs/.vitepress/theme"))).toEqual(["index.ts"])
    const css = fs
      .readdirSync(path.join(REPO_ROOT, "docs/.vitepress"), { recursive: true, encoding: "utf8" })
      .filter((file) => /\.css$/.test(file) && !/^(miragon|dist|cache)\//.test(file))
    expect(css).toEqual([])
  })
})

describe("docs kit: wiring", () => {
  it("the theme is the kit's", () => {
    expect(read("docs/.vitepress/theme/index.ts")).toMatch(
      /^export \{ default \} from "\.\.\/miragon\/theme"$/m,
    )
  })

  it("config.ts is miragonDocs() with this product's names", () => {
    expect(config).toContain('import { miragonDocs } from "./miragon/config"')
    expect(config).toMatch(/export default miragonDocs\(\{/)
    expect(config).toMatch(/\brepo: "Miragon\/mcp-toolkit"/)
    expect(config).toMatch(/\btitle: "Miragon MCP Toolkit"/)
    expect(config).toMatch(/\bsiteTitle: "MCP Toolkit"/)
    expect(read("docs/index.md")).toMatch(/^ {2}name: Miragon MCP Toolkit$/m)
  })

  it("leaves to the kit what the kit sets", () => {
    // base, head, logo, theme colours, Shiki, anchors, search, footer: a value
    // here would fork the brand or overwrite the kit (the skill calls that a finding).
    const code = config.replace(/^\s*\/\/.*$/gm, "")
    for (const own of [
      "defineConfig",
      "base:",
      "head:",
      "themeConfig",
      "slugify",
      "theme-color",
      "logo",
      "footer",
      "mermaid:",
    ]) {
      expect(code, own).not.toContain(own)
    }
  })

  it("docs/package.json takes the kit's pins", () => {
    const pkg = JSON.parse(read("docs/package.json")) as {
      devDependencies: Record<string, string>
    }
    expect(pkg.devDependencies).toEqual({
      "@braintree/sanitize-url": "7.1.2",
      "@fontsource-variable/geist": "5.3.0",
      "@fontsource-variable/geist-mono": "5.3.0",
      cytoscape: "3.34.3",
      "cytoscape-cose-bilkent": "4.1.0",
      dayjs: "1.11.23",
      debug: "4.4.3",
      mermaid: "11.17.2",
      vitepress: "1.6.4",
      "vitepress-plugin-mermaid": "2.0.17",
    })
    // docs/ is a pnpm workspace member: the vite override lives in the workspace.
    expect(read("pnpm-workspace.yaml")).toMatch(/^ {2}vitepress>vite: 6\.4\.3$/m)
  })

  it("the docs workflow checks the kit on pull requests and deploys only from main", () => {
    const docs = read(".github/workflows/docs.yml")
    expect(docs).toMatch(/^ {2}pull_request:$/m)
    expect(docs).toContain("run: node .vitepress/miragon/check.mjs")
    expect(docs).toContain("fetch-depth: 0")
    expect(docs).toContain("DOCS_BASE: /mcp-toolkit/")
    expect(docs).toMatch(/^permissions: \{\}$/m)
    const deploy = docs.slice(docs.indexOf("\n  deploy:"))
    expect(deploy).toContain(
      "if: github.event_name != 'pull_request' && github.ref == 'refs/heads/main'",
    )
    expect(deploy).toContain("group: pages")
  })

  it("the brand job checks out the CI release the kit came from", () => {
    const ci = read(".github/workflows/ci.yml")
    expect(ci).toContain(`ref: v${manifest.version}`)
    expect(ci).toContain("run: node docs/.vitepress/miragon/check.mjs --ci .ci-source")
    expect(ci).toMatch(/brand-lint\.mjs --nur-hart docs README\.md$/m)
  })

  it("brand-lint covers every docs page and keeps the em dash rule on", () => {
    const brand = JSON.parse(read(".miragon/brand.json")) as {
      ignorieren?: string[]
      aus?: string[]
    }
    const docsIgnored = (brand.ignorieren ?? []).filter(
      (entry) => entry.startsWith("docs") && entry !== `${KIT}/`,
    )
    expect(docsIgnored).toEqual([])
    expect(brand.aus ?? []).not.toContain("A2")
  })

  it("keeps the pages miragon.ai links (the docs home and the guided tour)", () => {
    for (const page of ["docs/index.md", "docs/playground/tour.md"]) {
      expect(fs.existsSync(path.join(REPO_ROOT, page)), page).toBe(true)
    }
  })
})

// ── Anchors ────────────────────────────────────────────────────────────────

/** Markdown with links into the docs: the site's pages and what GitHub renders next to it. */
const SOURCES = [
  "README.md",
  "CLAUDE.md",
  "CONTRIBUTING.md",
  "FITNESS.md",
  "packages/core/README.md",
  "packages/ui/README.md",
  "packages/tool-codegen/README.md",
]
const SKIP_DIRS = new Set(["node_modules", ".vitepress", "dist"])

function markdownIn(rel: string): string[] {
  return fs.readdirSync(path.join(REPO_ROOT, rel), { withFileTypes: true }).flatMap((entry) => {
    if (SKIP_DIRS.has(entry.name)) return []
    const child = path.posix.join(rel, entry.name)
    if (entry.isDirectory()) return markdownIn(child)
    return entry.name.endsWith(".md") ? [child] : []
  })
}

/** The lines outside fenced code blocks. */
function proseLines(markdown: string): string[] {
  let fence: string | null = null
  return markdown.split("\n").filter((line) => {
    const open = /^\s*(`{3,}|~{3,})/.exec(line)?.[1]
    if (open && (fence === null || open.startsWith(fence))) {
      fence = fence === null ? open : null
      return false
    }
    return fence === null
  })
}

/** A heading's text as markdown-it hands it to the slugger: code kept, links and emphasis plain. */
function headingText(source: string): string {
  return source
    .split(/(`[^`]*`)/)
    .map((part, i) =>
      i % 2 === 1
        ? part.slice(1, -1)
        : part
            .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
            .replace(/<[^>]+>/g, "")
            .replace(/\*/g, ""),
    )
    .join("")
    .trim()
}

/** The anchors of a page, duplicates counted like GitHub and markdown-it-anchor. */
function anchorsOf(markdown: string): Set<string> {
  const seen = new Map<string, number>()
  const ids = new Set<string>()
  for (const line of proseLines(markdown)) {
    const heading = /^#{1,6}\s+(.+?)\s*#*\s*$/.exec(line)?.[1]
    if (!heading) continue
    const slug = githubSlug(headingText(heading))
    const n = seen.get(slug) ?? 0
    seen.set(slug, n + 1)
    ids.add(n === 0 ? slug : `${slug}-${n}`)
  }
  return ids
}

/** Every `[text](target#anchor)` of a file whose target is a Markdown file in the repo. */
function anchorLinks(file: string): { link: string; page: string; anchor: string }[] {
  const text = proseLines(read(file)).join("\n")
  return [...text.matchAll(/\]\(([^)\s]*)#([^)\s]+)\)/g)].flatMap((m) => {
    const [link, target = "", anchor = ""] = m
    if (/^[a-z]+:/i.test(target)) return []
    const page = target === "" ? file : path.posix.join(path.posix.dirname(file), target)
    const md = page.endsWith(".md") ? page : `${page.replace(/\/$/, "")}.md`
    return fs.existsSync(path.join(REPO_ROOT, md))
      ? [{ link, page: md, anchor: decodeURIComponent(anchor) }]
      : []
  })
}

describe("docs anchors", () => {
  const files = [...markdownIn("docs"), ...SOURCES].sort()

  it("slugs a heading like GitHub (and the site)", () => {
    expect(githubSlug(headingText("Upgrading from toolkit 2.5"))).toBe("upgrading-from-toolkit-25")
    expect(githubSlug(headingText("`requires` vs `consumes`: two contracts"))).toBe(
      "requires-vs-consumes-two-contracts",
    )
    expect(githubSlug(headingText("ListFooter / PagedListFooter"))).toBe(
      "listfooter--pagedlistfooter",
    )
    expect(githubSlug(headingText("App-only tools, `_data` feeds"))).toBe(
      "app-only-tools-_data-feeds",
    )
    expect(githubSlug(headingText("See [the tour](./tour.md) **now**"))).toBe("see-the-tour-now")
  })

  it("counts duplicate headings and skips code blocks (self-test)", () => {
    const page = "# Setup\n\n```sh\n# not a heading\n```\n\n## Setup\n\n### Setup\n"
    expect([...anchorsOf(page)]).toEqual(["setup", "setup-1", "setup-2"])
  })

  it("scans the docs and the READMEs", () => {
    expect(files).toContain("docs/getting-started.md")
    expect(files).toContain("docs/reference/components.md")
    expect(files.flatMap(anchorLinks).length).toBeGreaterThan(10)
  })

  it("every #anchor link into a Markdown page hits a heading", () => {
    const anchors = new Map<string, Set<string>>()
    const dead = files.flatMap((file) =>
      anchorLinks(file).flatMap(({ link, page, anchor }) => {
        if (!anchors.has(page)) anchors.set(page, anchorsOf(read(page)))
        return anchors.get(page)?.has(anchor) ? [] : [`${file}: ${link}`]
      }),
    )
    expect(
      dead,
      "A link points at a heading that does not exist. Anchors follow GitHub's rule " +
        '(docs/.vitepress/miragon/slug.mjs): "Changes from 0.6" is #changes-from-06.',
    ).toEqual([])
  })
})
