import { describe, expect, it } from "vitest"
import { APP_ONLY_META, uiMeta } from "./meta.js"

describe("APP_ONLY_META", () => {
  it("is the SEP-1865 app-only visibility marker without a resourceUri", () => {
    expect(APP_ONLY_META).toEqual({ ui: { visibility: ["app"] } })
  })
})

describe("uiMeta", () => {
  it("emits only resourceUri for a model-visible widget tool", () => {
    expect(uiMeta({ resourceUri: "ui://app" })).toEqual({ ui: { resourceUri: "ui://app" } })
  })

  it("emits resourceUri + visibility for an app-only widget tool", () => {
    expect(uiMeta({ resourceUri: "ui://app", appOnly: true })).toEqual({
      ui: { resourceUri: "ui://app", visibility: ["app"] },
    })
  })

  it("emits only visibility for an app-only tool without UI", () => {
    expect(uiMeta({ appOnly: true })).toEqual({ ui: { visibility: ["app"] } })
  })

  it("emits an empty ui object when neither option is set", () => {
    expect(uiMeta({})).toEqual({ ui: {} })
  })

  it("omits visibility when appOnly is false", () => {
    expect(uiMeta({ resourceUri: "ui://app", appOnly: false })).toEqual({
      ui: { resourceUri: "ui://app" },
    })
  })
})
