#!/usr/bin/env node
/**
 * Regenerate the playground screenshots in docs/playground/images/ from the
 * running UI, so a UI change refreshes them in the same PR. (They went stale
 * once: the tour showed "View Builder", "Pipeline 1/2", black buttons and an
 * overlapping KPI strip a release after the UI had changed.)
 *
 * Prerequisites (once):
 *   pnpm install && pnpm -r run build
 *   pnpm --filter @miragon/mcp-toolkit-examples run build:bundle
 *   pnpm exec playwright install chromium
 * Run:
 *   node scripts/docs-shots.mjs
 *
 * It boots the playground host (examples/host/playground.ts) and the
 * standalone host's `mcp-use dev` server for its inspector, points the
 * inspector at the playground and follows the guided tour: the landing page,
 * the inspector, show_tasks_board, show_orders_dashboard, and the render-view
 * pipeline with its Edit view button open. Widgets are captured at a chat's
 * inline width (the inspector's response frame) at 2x. Both servers stop when
 * the script ends.
 */
import { spawn } from "node:child_process"
import path from "node:path"
import { setTimeout as sleep } from "node:timers/promises"
import { fileURLToPath } from "node:url"
import { chromium } from "playwright"

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const OUT = path.join(ROOT, "docs", "playground", "images")
const PLAYGROUND = "http://localhost:4520/mcp"
const INSPECTOR =
  "http://localhost:4521/mcp/inspector?autoConnect=" + encodeURIComponent(PLAYGROUND) + "&tab=tools"

/** The pipeline of tour stop 5 (docs/playground/tour.md). */
const PIPELINE = {
  keys: { "orders:customerId": "c-1" },
  steps: [
    { id: "customer", step: "orders:resolve-customer" },
    { id: "orders", step: "orders:list-customer-orders" },
  ],
  layout: {
    rows: [
      { row: [{ widget: "orders:kpi", span: 12 }] },
      { row: [{ widget: "orders:table", span: 12 }] },
    ],
  },
  title: "Orders pipeline view",
}

const servers = []

/** Start a pnpm command in the examples package; its process group stops with the script. */
function start(args, env) {
  const child = spawn("pnpm", ["--filter", "@miragon/mcp-toolkit-examples", "exec", ...args], {
    cwd: ROOT,
    env: { ...process.env, ...env },
    detached: true,
    stdio: "ignore",
  })
  servers.push(child)
}

async function waitFor(url, label) {
  for (let i = 0; i < 120; i++) {
    try {
      const res = await fetch(url, { headers: { accept: "text/html" } })
      if (res.status < 500) return
    } catch {
      // not up yet
    }
    await sleep(500)
  }
  throw new Error(`${label} did not come up at ${url}`)
}

function stopServers() {
  for (const child of servers) {
    try {
      process.kill(-child.pid, "SIGTERM")
    } catch {
      // already gone
    }
  }
}

/** The innermost frame that renders the toolkit view (the widget iframe). */
async function viewFrame(page) {
  for (let i = 0; i < 40; i++) {
    for (const frame of page.frames()) {
      if (frame === page.mainFrame()) continue
      const ready = await frame
        .evaluate(
          () =>
            Boolean(document.querySelector("[data-slot]")) && document.body.innerText.length > 20,
        )
        .catch(() => false)
      if (ready) return frame
    }
    await sleep(500)
  }
  throw new Error("No rendered view frame")
}

/** The first view frame in which `locate(frame)` finds an element (the inspector may keep old frames). */
async function frameWith(page, locate) {
  for (let i = 0; i < 40; i++) {
    for (const frame of page.frames()) {
      if (frame === page.mainFrame()) continue
      if (
        (await locate(frame)
          .count()
          .catch(() => 0)) > 0
      )
        return frame
    }
    await sleep(500)
  }
  throw new Error("No view frame with the expected element")
}

/** The iframe element in the inspector page that hosts `frame`. */
async function hostIframe(page, frame) {
  let f = frame
  while (f.parentFrame() && f.parentFrame() !== page.mainFrame()) f = f.parentFrame()
  return f.frameElement()
}

async function run(page, tool, args = {}) {
  await page.locator(`#tool-${tool}`).click()
  await sleep(800)
  for (const [id, value] of Object.entries(args)) {
    await page.locator(`#${id}`).fill(typeof value === "string" ? value : JSON.stringify(value))
  }
  await page
    .getByRole("button", { name: /Execute/ })
    .first()
    .click()
  await sleep(4000)
  return viewFrame(page)
}

/** The view's frame as a host shows it, cut at `maxHeight` CSS px (the builder grows tall). */
async function shootView(page, frame, file, maxHeight = 1400) {
  const iframe = await hostIframe(page, frame)
  await iframe.scrollIntoViewIfNeeded()
  const box = await iframe.boundingBox()
  if (!box) throw new Error(`${file}: the view frame is not visible`)
  const clip = { ...box, height: Math.min(box.height, maxHeight) }
  await page.screenshot({ path: path.join(OUT, file), clip })
  console.log(`docs-shots: ${file}`)
}

process.on("exit", stopServers)
process.on("SIGINT", () => process.exit(130))

start(["tsx", "host/playground.ts"], { PORT: "4520" })
start(["mcp-use", "dev", "--path", "standalone-host", "--no-open", "--port", "4521"], {})
await waitFor(PLAYGROUND, "The playground host")
await waitFor("http://localhost:4521/mcp/inspector", "The inspector")

const browser = await chromium.launch()
try {
  // The landing page a browser gets on the playground's MCP endpoint.
  const landing = await browser.newPage({ viewport: { width: 1600, height: 1000 } })
  await landing.goto(PLAYGROUND, { waitUntil: "networkidle" })
  await landing.screenshot({ path: path.join(OUT, "landing-page.png") })
  console.log("docs-shots: landing-page.png")
  await landing.close()

  const page = await browser.newPage({
    viewport: { width: 1440, height: 1300 },
    deviceScaleFactor: 2,
  })
  await page.goto(INSPECTOR, { waitUntil: "load" })
  await page.locator("#tool-show_tasks_board").waitFor({ timeout: 30_000 })

  const tasks = await run(page, "show_tasks_board")
  await page.screenshot({ path: path.join(OUT, "inspector.png"), scale: "css" })
  console.log("docs-shots: inspector.png")
  await shootView(page, tasks, "tasks-board.png")

  const orders = await run(page, "show_orders_dashboard", { customerId: "c-1" })
  await shootView(page, orders, "orders-dashboard.png")

  await run(page, "render-view", PIPELINE)
  const editable = await frameWith(page, (frame) =>
    frame.getByRole("button", { name: "Edit view" }),
  )
  await editable.getByRole("button", { name: "Edit view" }).click()
  await sleep(2500)
  // The builder is taller than the inline view: give the frame room so no
  // inspector chrome overlaps it, and keep the palette and the first rows.
  await page.setViewportSize({ width: 1440, height: 2800 })
  await sleep(1000)
  await shootView(page, editable, "builder.png", 1000)
} finally {
  await browser.close()
  stopServers()
}
