import { describe, it, expect } from "vitest"
import {
  ModuleManifestSchema,
  MODULE_MANIFEST_SCHEMA_VERSION,
  type ModuleManifest,
  GET_MODULE_MANIFEST_TOOL,
} from "./module-manifest.js"

const validManifest: ModuleManifest = {
  schemaVersion: 1,
  moduleId: "items-ui",
  runtime: { react: "^19.0.0" },
  steps: [
    {
      id: "items-ui:resolve-item",
      dataType: "items-ui:item",
      requires: ["items-ui:itemId"],
      produces: ["items-ui:item"],
      tool: "get-item",
      inputMapping: { id: "keys.items-ui:itemId" },
      outputMapping: { "items-ui:item": "result" },
    },
  ],
  widgets: [
    {
      id: "items-ui:item-card",
      requires: ["items-ui:item"],
      bundle: "ui://items-ui/widgets/item-card.js",
    },
  ],
}

describe("ModuleManifestSchema", () => {
  it("round-trips a valid manifest through parse + serialize", () => {
    const parsed = ModuleManifestSchema.parse(validManifest)
    expect(parsed).toEqual(validManifest)
    const reparsed = ModuleManifestSchema.parse(JSON.parse(JSON.stringify(parsed)))
    expect(reparsed).toEqual(validManifest)
  })

  it("defaults schemaVersion to 1 when omitted", () => {
    const withoutVersion: Omit<ModuleManifest, "schemaVersion"> & { schemaVersion?: number } = {
      ...validManifest,
    }
    delete withoutVersion.schemaVersion
    const result = ModuleManifestSchema.safeParse(withoutVersion)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.schemaVersion).toBe(1)
      expect(result.data.schemaVersion).toBe(MODULE_MANIFEST_SCHEMA_VERSION)
    }
  })

  it("accepts an explicit current schemaVersion", () => {
    const result = ModuleManifestSchema.safeParse({
      ...validManifest,
      schemaVersion: MODULE_MANIFEST_SCHEMA_VERSION,
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.schemaVersion).toBe(MODULE_MANIFEST_SCHEMA_VERSION)
    }
  })

  it("preserves a future schemaVersion through parse so the host can gate on it", () => {
    const result = ModuleManifestSchema.safeParse({
      ...validManifest,
      schemaVersion: MODULE_MANIFEST_SCHEMA_VERSION + 1,
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.schemaVersion).toBe(MODULE_MANIFEST_SCHEMA_VERSION + 1)
    }
  })

  it("rejects a non-integer or below-minimum schemaVersion", () => {
    expect(ModuleManifestSchema.safeParse({ ...validManifest, schemaVersion: 1.5 }).success).toBe(
      false,
    )
    expect(ModuleManifestSchema.safeParse({ ...validManifest, schemaVersion: 0 }).success).toBe(
      false,
    )
  })

  it("requires a non-empty runtime.react string", () => {
    const result = ModuleManifestSchema.safeParse({
      ...validManifest,
      runtime: { react: "" },
    })
    expect(result.success).toBe(false)
  })

  it("rejects a moduleId that is not URL-safe", () => {
    const result = ModuleManifestSchema.safeParse({
      ...validManifest,
      moduleId: "Items UI",
    })
    expect(result.success).toBe(false)
  })

  it("rejects a step id that does not start with the module namespace", () => {
    const result = ModuleManifestSchema.safeParse({
      ...validManifest,
      steps: [
        {
          ...validManifest.steps[0],
          id: "other-mod:resolve-item",
        },
      ],
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.path.join(".") === "steps.0.id")).toBe(true)
    }
  })

  it("rejects a widget id that does not start with the module namespace", () => {
    const result = ModuleManifestSchema.safeParse({
      ...validManifest,
      widgets: [
        {
          ...validManifest.widgets[0],
          id: "other-mod:card",
        },
      ],
    })
    expect(result.success).toBe(false)
  })

  it("rejects duplicate step ids", () => {
    const step = validManifest.steps[0]
    const result = ModuleManifestSchema.safeParse({
      ...validManifest,
      steps: [step, step],
    })
    expect(result.success).toBe(false)
  })

  it("rejects duplicate widget ids", () => {
    const widget = validManifest.widgets[0]
    const result = ModuleManifestSchema.safeParse({
      ...validManifest,
      widgets: [widget, widget],
    })
    expect(result.success).toBe(false)
  })

  it("requires produced keys to live in the module namespace", () => {
    const result = ModuleManifestSchema.safeParse({
      ...validManifest,
      steps: [
        {
          ...validManifest.steps[0],
          produces: ["other-mod:item"],
        },
      ],
    })
    expect(result.success).toBe(false)
  })

  it("accepts an optional widget size hint", () => {
    const result = ModuleManifestSchema.safeParse({
      ...validManifest,
      widgets: [{ ...validManifest.widgets[0], size: "half" }],
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.widgets[0]?.size).toBe("half")
    }
  })

  it("rejects an unknown widget size hint", () => {
    const result = ModuleManifestSchema.safeParse({
      ...validManifest,
      widgets: [{ ...validManifest.widgets[0], size: "extra-large" }],
    })
    expect(result.success).toBe(false)
  })

  it("accepts an optional widget propsSchema", () => {
    const propsSchema = {
      type: "object",
      properties: { processDefinitionKey: { type: "string" } },
    }
    const result = ModuleManifestSchema.safeParse({
      ...validManifest,
      widgets: [{ ...validManifest.widgets[0], propsSchema }],
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.widgets[0]?.propsSchema).toEqual(propsSchema)
    }
  })

  it("exports the canonical manifest tool name", () => {
    expect(GET_MODULE_MANIFEST_TOOL).toBe("get-module-manifest")
  })
})
