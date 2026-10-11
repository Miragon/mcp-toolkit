import { describe, expect, it } from "vitest"
import {
  createToast,
  MAX_VISIBLE_TOASTS,
  TOAST_DURATION_MS,
  TOAST_ERROR_DURATION_MS,
  toastDuration,
  toastReducer,
  type ToastItem,
} from "./toast-model.js"

const item = (id: number): ToastItem => createToast(id, { title: `t${id}` })

describe("toastDuration (CI §8: about 2.8 s, errors about 5 s)", () => {
  it("defaults to 2.8 s and gives errors 5 s", () => {
    expect(TOAST_DURATION_MS).toBe(2800)
    expect(TOAST_ERROR_DURATION_MS).toBe(5000)
    expect(toastDuration("success")).toBe(2800)
    expect(toastDuration("info")).toBe(2800)
    expect(toastDuration("warning")).toBe(2800)
    expect(toastDuration("danger")).toBe(5000)
  })

  it("honours an explicit positive duration and ignores an unusable one", () => {
    expect(toastDuration("danger", 1200)).toBe(1200)
    expect(toastDuration("info", 0)).toBe(2800)
    expect(toastDuration("info", -5)).toBe(2800)
    expect(toastDuration("danger", Number.NaN)).toBe(5000)
    expect(toastDuration("danger", Number.POSITIVE_INFINITY)).toBe(5000)
  })
})

describe("createToast", () => {
  it("defaults to the info tone and drops an empty description", () => {
    expect(createToast(1, { title: "Saved" })).toEqual({
      id: 1,
      tone: "info",
      title: "Saved",
      duration: 2800,
    })
    expect(createToast(2, { title: "x", description: "" })).not.toHaveProperty("description")
  })

  it("keeps tone, description and the tone's duration", () => {
    expect(createToast(3, { tone: "danger", title: "Failed", description: "503" })).toEqual({
      id: 3,
      tone: "danger",
      title: "Failed",
      description: "503",
      duration: 5000,
    })
  })
})

describe("toastReducer", () => {
  it("appends and keeps at most the newest MAX_VISIBLE_TOASTS", () => {
    expect(MAX_VISIBLE_TOASTS).toBe(3)
    let state: ToastItem[] = []
    for (let id = 1; id <= 4; id++) state = toastReducer(state, { type: "add", toast: item(id) })
    expect(state.map((t) => t.id)).toEqual([2, 3, 4])
  })

  it("dismisses by id and keeps the list identity when nothing matches", () => {
    const state = [item(1), item(2)]
    expect(toastReducer(state, { type: "dismiss", id: 1 }).map((t) => t.id)).toEqual([2])
    expect(toastReducer(state, { type: "dismiss", id: 9 })).toBe(state)
  })
})
