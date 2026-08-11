/**
 * Eval case set + pure scoring (FITNESS.md, phase 5d).
 *
 * These are the ONLY checks in the repo that measure whether the tool
 * descriptions actually steer a model — the quality no unit test can see.
 * Scoring is deterministic (no LLM judge): either the model's FIRST tool_use
 * names the expected tool, and (where marked) its generated arguments
 * survive a REAL tools/call against the live server schema.
 *
 * Cases are versioned data: changing a prompt changes the measurement —
 * treat edits like golden updates (justify in the PR).
 */

export interface EvalCase {
  id: string
  /** The user turn sent to the model, verbatim. */
  prompt: string
  /** Name the FIRST tool_use must have. */
  expectFirstTool: string
  /** When true, the generated arguments are executed via tools/call and must not error. */
  executeCall: boolean
  /** Optional extra user context (e.g. a pre-fetched manifest for layout cases). */
  contextPrefix?: string
}

export const EVAL_CASES: EvalCase[] = [
  {
    id: "tasks-board-choice",
    prompt: "Show me my tasks as a board.",
    expectFirstTool: "show_tasks_board",
    executeCall: false,
  },
  {
    id: "orders-dashboard-choice",
    prompt: "Give me an at-a-glance dashboard of the orders of customer cus-1001.",
    expectFirstTool: "show_orders_dashboard",
    executeCall: false,
  },
  {
    id: "create-task-args",
    prompt: 'Create a task called "Ship the fitness gates" with high priority.',
    expectFirstTool: "create_task",
    executeCall: true,
  },
  {
    id: "list-tasks-filter",
    prompt: "List only my open tasks, nothing completed.",
    expectFirstTool: "list_tasks",
    executeCall: true,
  },
  {
    id: "manifest-first",
    prompt: "Build me a custom combined view with my task board and order KPIs side by side.",
    expectFirstTool: "get-framework-manifest",
    executeCall: false,
  },
  {
    id: "render-view-layout",
    prompt:
      "Using the manifest above, render a view that shows the tasks board widget in a full-width row.",
    expectFirstTool: "render-view",
    executeCall: true,
    contextPrefix: "Here is the framework manifest returned by get-framework-manifest:\n\n",
  },
]

/** Minimal shape of an Anthropic content block this scoring reads. */
export interface ModelContentBlock {
  type: string
  name?: string
  input?: unknown
}

/** First tool_use block of a model response, or null when the model answered in prose. */
export function firstToolUse(
  content: ModelContentBlock[],
): { name: string; input: unknown } | null {
  const block = content.find((c) => c.type === "tool_use")
  return block?.name ? { name: block.name, input: block.input ?? {} } : null
}

export interface RunScore {
  pass: boolean
  tool: string | null
  detail: string
}

/**
 * Scores one model response for a case. `callError` is the isError outcome of
 * executing the generated arguments (only consulted when the case executes).
 */
export function scoreRun(
  evalCase: EvalCase,
  content: ModelContentBlock[],
  callError?: boolean,
): RunScore {
  const tool = firstToolUse(content)
  if (!tool) return { pass: false, tool: null, detail: "no tool_use in the response" }
  if (tool.name !== evalCase.expectFirstTool) {
    return {
      pass: false,
      tool: tool.name,
      detail: `expected first tool ${evalCase.expectFirstTool}, got ${tool.name}`,
    }
  }
  if (evalCase.executeCall && callError !== false) {
    return {
      pass: false,
      tool: tool.name,
      detail: "generated arguments failed the real tools/call",
    }
  }
  return { pass: true, tool: tool.name, detail: "ok" }
}

/** A tool is app-only (hidden from models) when _meta.ui.visibility contains "app". */
export function isAppOnlyTool(tool: { _meta?: unknown }): boolean {
  const visibility = (tool._meta as { ui?: { visibility?: unknown } } | undefined)?.ui?.visibility
  return Array.isArray(visibility) && visibility.includes("app")
}

export function passRate(results: { runs: RunScore[] }[]): number {
  const runs = results.flatMap((r) => r.runs)
  if (runs.length === 0) return 0
  return runs.filter((r) => r.pass).length / runs.length
}
