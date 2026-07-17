import { describe, it, expect } from "vitest"
import {
  ModuleManifestSchema,
  MODULE_MANIFEST_SCHEMA_VERSION,
  isHostWidgetRef,
  type HostWidgetRef,
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

const hostRefWidget: HostWidgetRef = {
  id: "items-ui:kpi-row",
  requires: ["items-ui:item"],
  hostWidget: "shell:kpi-grid",
  props: { title: "Items", columns: 3 },
  size: "quarter",
}

const validHostRefManifest: ModuleManifest = {
  ...validManifest,
  schemaVersion: 2,
  widgets: [...validManifest.widgets, hostRefWidget],
}

describe("ModuleManifestSchema", () => {
  it("round-trips a valid manifest through parse + serialize", () => {
    const parsed = ModuleManifestSchema.parse(validManifest)
    expect(parsed).toEqual(validManifest)
    const reparsed = ModuleManifestSchema.parse(JSON.parse(JSON.stringify(parsed)))
    expect(reparsed).toEqual(validManifest)
  })

  it("pins the current contract version at 2", () => {
    expect(MODULE_MANIFEST_SCHEMA_VERSION).toBe(2)
  })

  it("defaults schemaVersion to 1 when omitted (v1 manifests stay valid)", () => {
    const withoutVersion: Omit<ModuleManifest, "schemaVersion"> & { schemaVersion?: number } = {
      ...validManifest,
    }
    delete withoutVersion.schemaVersion
    const result = ModuleManifestSchema.safeParse(withoutVersion)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.schemaVersion).toBe(1)
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

  it("rejects an outputMapping key that is not declared in produces", () => {
    const result = ModuleManifestSchema.safeParse({
      ...validManifest,
      steps: [
        {
          ...validManifest.steps[0],
          // `produces` only lists `items-ui:item`; the mapping writes a key the
          // step never declared — a typo the contract must catch.
          outputMapping: { "items-ui:itme": "result" },
        },
      ],
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(
        result.error.issues.some(
          (issue) => issue.path.join(".") === "steps.0.outputMapping.items-ui:itme",
        ),
      ).toBe(true)
    }
  })

  it("rejects an empty inputMapping dot-path", () => {
    const result = ModuleManifestSchema.safeParse({
      ...validManifest,
      steps: [
        {
          ...validManifest.steps[0],
          inputMapping: { id: "" },
        },
      ],
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(
        result.error.issues.some((issue) => issue.path.join(".") === "steps.0.inputMapping.id"),
      ).toBe(true)
    }
  })

  it("rejects an empty outputMapping dot-path", () => {
    const result = ModuleManifestSchema.safeParse({
      ...validManifest,
      steps: [
        {
          ...validManifest.steps[0],
          outputMapping: { "items-ui:item": "" },
        },
      ],
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(
        result.error.issues.some(
          (issue) => issue.path.join(".") === "steps.0.outputMapping.items-ui:item",
        ),
      ).toBe(true)
    }
  })

  it("accepts a step whose outputMapping keys all live in produces", () => {
    const result = ModuleManifestSchema.safeParse({
      ...validManifest,
      steps: [
        {
          ...validManifest.steps[0],
          produces: ["items-ui:item", "items-ui:itemMeta"],
          outputMapping: { "items-ui:item": "result", "items-ui:itemMeta": "meta" },
        },
      ],
    })
    expect(result.success).toBe(true)
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

describe("ModuleManifestSchema v2 — host-widget refs", () => {
  it("round-trips a v2 manifest with a hostWidget reference", () => {
    const parsed = ModuleManifestSchema.parse(validHostRefManifest)
    expect(parsed).toEqual(validHostRefManifest)
    const reparsed = ModuleManifestSchema.parse(JSON.parse(JSON.stringify(parsed)))
    expect(reparsed).toEqual(validHostRefManifest)
    const alias = reparsed.widgets[1]
    expect(alias).toBeDefined()
    if (alias && isHostWidgetRef(alias)) {
      expect(alias.hostWidget).toBe("shell:kpi-grid")
      expect(alias.props).toEqual({ title: "Items", columns: 3 })
      expect(alias.size).toBe("quarter")
    } else {
      expect.unreachable("widget entry should be a host-widget reference")
    }
  })

  it("rejects a widget entry carrying BOTH bundle and hostWidget", () => {
    const result = ModuleManifestSchema.safeParse({
      ...validHostRefManifest,
      widgets: [
        {
          id: "items-ui:item-card",
          requires: ["items-ui:item"],
          bundle: "ui://items-ui/widgets/item-card.js",
          hostWidget: "shell:kpi-grid",
        },
      ],
    })
    expect(result.success).toBe(false)
  })

  it("rejects a widget entry with NEITHER bundle nor hostWidget", () => {
    const result = ModuleManifestSchema.safeParse({
      ...validHostRefManifest,
      widgets: [{ id: "items-ui:item-card", requires: ["items-ui:item"] }],
    })
    expect(result.success).toBe(false)
  })

  it("rejects an empty hostWidget target", () => {
    const result = ModuleManifestSchema.safeParse({
      ...validHostRefManifest,
      widgets: [{ ...hostRefWidget, hostWidget: "" }],
    })
    expect(result.success).toBe(false)
  })

  it("still enforces the module namespace on the alias id", () => {
    const result = ModuleManifestSchema.safeParse({
      ...validHostRefManifest,
      widgets: [{ ...hostRefWidget, id: "other-mod:kpi-row" }],
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.path.join(".") === "widgets.0.id")).toBe(
        true,
      )
    }
  })

  it("exempts the hostWidget TARGET from the module namespace check", () => {
    // `shell:` is a foreign namespace relative to moduleId `items-ui` — by
    // design: the target names a widget of the host, not one of the module's.
    const result = ModuleManifestSchema.safeParse(validHostRefManifest)
    expect(result.success).toBe(true)
  })

  it("rejects a hostWidget reference under schemaVersion 1", () => {
    const result = ModuleManifestSchema.safeParse({
      ...validHostRefManifest,
      schemaVersion: 1,
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      const issue = result.error.issues.find(
        (candidate) => candidate.path.join(".") === "widgets.1.hostWidget",
      )
      expect(issue?.message).toBe("hostWidget references require schemaVersion >= 2")
    }
  })

  it("rejects a hostWidget reference when schemaVersion is omitted (defaults to 1)", () => {
    const withoutVersion: Omit<ModuleManifest, "schemaVersion"> & { schemaVersion?: number } = {
      ...validHostRefManifest,
    }
    delete withoutVersion.schemaVersion
    const result = ModuleManifestSchema.safeParse(withoutVersion)
    expect(result.success).toBe(false)
  })

  it("narrows entries with the isHostWidgetRef guard", () => {
    const parsed = ModuleManifestSchema.parse(validHostRefManifest)
    expect(parsed.widgets.map(isHostWidgetRef)).toEqual([false, true])
  })

  it("applies duplicate-id detection across both widget flavours", () => {
    const result = ModuleManifestSchema.safeParse({
      ...validHostRefManifest,
      widgets: [...validManifest.widgets, { ...hostRefWidget, id: "items-ui:item-card" }],
    })
    expect(result.success).toBe(false)
  })
})

describe("ModuleManifestSchema v2 — runtime extras", () => {
  it("accepts all three optional runtime extras at schemaVersion 2", () => {
    const result = ModuleManifestSchema.safeParse({
      ...validManifest,
      schemaVersion: 2,
      runtime: {
        react: "^19.0.0",
        mcpUseReact: "^1.2.0",
        toolkitUi: "~0.9.0",
        reactQuery: "^5.0.0",
      },
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.runtime).toEqual({
        react: "^19.0.0",
        mcpUseReact: "^1.2.0",
        toolkitUi: "~0.9.0",
        reactQuery: "^5.0.0",
      })
    }
  })

  it("rejects an empty-string runtime extra", () => {
    const result = ModuleManifestSchema.safeParse({
      ...validManifest,
      schemaVersion: 2,
      runtime: { react: "^19.0.0", toolkitUi: "" },
    })
    expect(result.success).toBe(false)
  })

  it("rejects runtime extras under schemaVersion 1", () => {
    const result = ModuleManifestSchema.safeParse({
      ...validManifest,
      schemaVersion: 1,
      runtime: { react: "^19.0.0", toolkitUi: "~0.9.0" },
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      const issue = result.error.issues.find(
        (candidate) => candidate.path.join(".") === "schemaVersion",
      )
      expect(issue?.message).toBe(
        "runtime.mcpUseReact/toolkitUi/reactQuery require schemaVersion >= 2",
      )
    }
  })

  it("rejects runtime extras when schemaVersion is omitted (defaults to 1)", () => {
    const result = ModuleManifestSchema.safeParse({
      ...validManifest,
      schemaVersion: undefined,
      runtime: { react: "^19.0.0", reactQuery: "^5.0.0" },
    })
    expect(result.success).toBe(false)
  })

  it("accepts runtime extras alongside a hostWidget reference at schemaVersion 2", () => {
    const result = ModuleManifestSchema.safeParse({
      ...validHostRefManifest,
      runtime: { react: "^19.0.0", toolkitUi: "~0.9.0" },
    })
    expect(result.success).toBe(true)
  })
})
