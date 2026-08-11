import { describe, expect, it } from "vitest"
import {
  EVAL_CASES,
  firstToolUse,
  isAppOnlyTool,
  passRate,
  scoreRun,
  type ModelContentBlock,
} from "./cases.js"

/**
 * Negative tests for the eval scoring (FITNESS.md phase 5d): the runner is a
 * thin loop, the SCORING decides pass/fail — every failure mode must score
 * as failed, deterministically, without a model in the loop.
 */

const toolUse = (name: string, input: unknown = {}): ModelContentBlock => ({
  type: "tool_use",
  name,
  input,
})
const text: ModelContentBlock = { type: "text" }

const choiceCase = EVAL_CASES.find((c) => c.id === "tasks-board-choice")!
const execCase = EVAL_CASES.find((c) => c.id === "create-task-args")!

describe("scoreRun", () => {
  it("passes on the expected first tool", () => {
    expect(scoreRun(choiceCase, [text, toolUse("show_tasks_board")]).pass).toBe(true)
  })

  it("fails on the wrong tool (e.g. the raw list instead of the widget tool)", () => {
    const score = scoreRun(choiceCase, [toolUse("list_tasks")])
    expect(score.pass).toBe(false)
    expect(score.detail).toContain("expected first tool show_tasks_board")
  })

  it("fails on a prose-only answer", () => {
    expect(scoreRun(choiceCase, [text]).pass).toBe(false)
  })

  it("scores only the FIRST tool_use (ordering promise)", () => {
    expect(scoreRun(choiceCase, [toolUse("list_tasks"), toolUse("show_tasks_board")]).pass).toBe(
      false,
    )
  })

  it("execute cases fail when the real call errored — or was never executed", () => {
    expect(scoreRun(execCase, [toolUse("create_task", { title: "x" })], true).pass).toBe(false)
    expect(scoreRun(execCase, [toolUse("create_task", { title: "x" })], undefined).pass).toBe(false)
    expect(scoreRun(execCase, [toolUse("create_task", { title: "x" })], false).pass).toBe(true)
  })
})

describe("app-only filtering", () => {
  it("hides visibility:['app'] tools from the model, keeps the rest", () => {
    expect(isAppOnlyTool({ _meta: { ui: { visibility: ["app"] } } })).toBe(true)
    expect(isAppOnlyTool({ _meta: {} })).toBe(false)
    expect(isAppOnlyTool({})).toBe(false)
  })
})

describe("pass rate", () => {
  it("aggregates across cases and runs; empty input is 0, never NaN", () => {
    const pass = { pass: true, tool: "t", detail: "ok" }
    const fail = { pass: false, tool: null, detail: "no" }
    expect(passRate([{ runs: [pass, pass] }, { runs: [fail, pass] }])).toBe(0.75)
    expect(passRate([])).toBe(0)
  })
})

describe("case-set hygiene", () => {
  it("ids are unique and every case names a real expectation", () => {
    const ids = EVAL_CASES.map((c) => c.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const c of EVAL_CASES) {
      expect(c.prompt.length).toBeGreaterThan(10)
      expect(c.expectFirstTool).toMatch(/^[a-z0-9_-]+$/)
    }
  })

  it("firstToolUse ignores non-tool blocks and tolerates empty content", () => {
    expect(firstToolUse([])).toBeNull()
    expect(firstToolUse([text])).toBeNull()
    expect(firstToolUse([text, toolUse("x", { a: 1 })])).toEqual({ name: "x", input: { a: 1 } })
  })
})
