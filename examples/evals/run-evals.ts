/**
 * Eval runner (FITNESS.md, phase 5d): boots the real tasks+orders host over
 * loopback, hands the model exactly what a host would (tools/list minus
 * app-only tools), runs every case RUNS times against a real model, executes
 * generated arguments via real tools/call where the case demands it, and
 * writes examples/evals/results.json for the fitness report.
 *
 * Non-blocking for PRs by design (cost, nondeterminism) — runs nightly via
 * .github/workflows/eval.yml. The pass rate is ratcheted raise-only in
 * ratchets/eval-pass-rate.json once a baseline exists (median of 3 nights).
 *
 * Env: ANTHROPIC_API_KEY (required — a missing key is a HARD error, never a
 * silent skip), EVAL_MODEL (default claude-haiku-4-5: the cheaper model is
 * deliberately the STRICTER test of description quality).
 *
 * Run: pnpm --filter @miragon/mcp-toolkit-examples run evals
 */
import fs from "node:fs"
import net from "node:net"
import path from "node:path"
import Anthropic from "@anthropic-ai/sdk"
import { createFrameworkApp, createInMemoryDashboardStore } from "@miragon/mcp-toolkit-core/tools"
import { MCPClient, type MCPSession } from "@mcp-use/client"
import { createPlugin as createTasksPlugin } from "../modules/tasks/plugin.js"
import { createPlugin as createOrdersPlugin } from "../modules/orders/plugin.js"
import { EVAL_CASES, isAppOnlyTool, passRate, scoreRun, type RunScore } from "./cases.js"

const RUNS = 3
const MODEL = process.env.EVAL_MODEL ?? "claude-haiku-4-5"

if (!process.env.ANTHROPIC_API_KEY) {
  console.error(
    "run-evals: ANTHROPIC_API_KEY is not set. A silently skipped eval is a gate hole — set the secret (eval.yml) or export the key locally. Refusing to pretend this ran.",
  )
  process.exit(1)
}

const getFreePort = (): Promise<number> =>
  new Promise((resolve, reject) => {
    const probe = net.createServer()
    probe.once("error", reject)
    probe.listen(0, "127.0.0.1", () => {
      const { port } = probe.address() as net.AddressInfo
      probe.close(() => resolve(port))
    })
  })

const app = await createFrameworkApp({
  name: "eval-host",
  version: "0.0.0",
  host: "127.0.0.1",
  plugins: [createTasksPlugin(), createOrdersPlugin()],
  app: {
    bundle: { jsPath: path.join(import.meta.dirname, "..", "test", "fixtures", "mcp-app.js") },
    builder: true,
    dashboardStore: createInMemoryDashboardStore(),
  },
})
const port = await getFreePort()
await app.listen(port)
const client = MCPClient.fromDict({
  mcpServers: { host: { url: `http://127.0.0.1:${port}/mcp` } },
})
const session: MCPSession = await client.createSession("host")

const allTools = (await session.listTools()) as {
  name: string
  description?: string
  inputSchema: unknown
  _meta?: unknown
}[]
const modelTools = allTools
  .filter((t) => !isAppOnlyTool(t))
  .map((t) => ({
    name: t.name,
    description: t.description ?? "",
    input_schema: t.inputSchema as Anthropic.Tool.InputSchema,
  }))
console.error(
  `run-evals: host up with ${allTools.length} tools, ${modelTools.length} model-visible (app-only filtered) — model ${MODEL}, ${RUNS} runs x ${EVAL_CASES.length} cases`,
)

// Pre-fetch the manifest once for cases that inject it as context.
const manifestResult = await session.callTool("get-framework-manifest", {})
const manifestText =
  (manifestResult.content as { type: string; text?: string }[]).find((c) => c.type === "text")
    ?.text ?? "{}"

const anthropic = new Anthropic()
const results: { id: string; runs: RunScore[] }[] = []

for (const evalCase of EVAL_CASES) {
  const runs: RunScore[] = []
  for (let i = 0; i < RUNS; i++) {
    const prompt = evalCase.contextPrefix
      ? `${evalCase.contextPrefix}${manifestText}\n\n${evalCase.prompt}`
      : evalCase.prompt
    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 1024,
      tools: modelTools,
      messages: [{ role: "user", content: prompt }],
    })
    let callError: boolean | undefined
    const first = response.content.find((c) => c.type === "tool_use")
    if (evalCase.executeCall && first?.type === "tool_use") {
      try {
        const callResult = await session.callTool(
          first.name,
          first.input as Record<string, unknown>,
        )
        callError = Boolean(callResult.isError)
      } catch {
        callError = true
      }
    }
    const score = scoreRun(evalCase, response.content, callError)
    runs.push(score)
    console.error(
      `  ${evalCase.id} run ${i + 1}/${RUNS}: ${score.pass ? "PASS" : `FAIL (${score.detail})`}`,
    )
  }
  results.push({ id: evalCase.id, runs })
}

const rate = passRate(results)
const out = {
  model: MODEL,
  runsPerCase: RUNS,
  cases: results,
  passRate: Number(rate.toFixed(4)),
}
const outPath = path.join(import.meta.dirname, "results.json")
fs.writeFileSync(outPath, JSON.stringify(out, null, 2) + "\n", "utf8")
console.error(`run-evals: pass rate ${(rate * 100).toFixed(1)}% -> ${outPath}`)

const ratchet = JSON.parse(
  fs.readFileSync(
    path.join(import.meta.dirname, "..", "..", "ratchets", "eval-pass-rate.json"),
    "utf8",
  ),
) as { minPassRate: number }
await client.closeAllSessions()
await app.close()
if (rate < ratchet.minPassRate) {
  console.error(
    `run-evals: pass rate ${(rate * 100).toFixed(1)}% is below the raise-only floor ${(ratchet.minPassRate * 100).toFixed(1)}% — most likely a description/.describe() change degraded model steering. Compare the latest tools/list golden diff before touching the floor.`,
  )
  process.exit(1)
}
process.exit(0)
