import { describe, it, expect } from "vitest"
import {
  isHostAliasWidget,
  isRemoteWidget,
  type HostAliasWidgetDefinition,
  type LocalWidgetDefinition,
  type RemoteWidgetDefinition,
} from "./widget.js"

const local: LocalWidgetDefinition = {
  id: "shell:kpi-grid",
  requires: [],
  size: "full",
}

const remote: RemoteWidgetDefinition = {
  id: "items-ui:item-card",
  requires: ["items-ui:item"],
  size: "half",
  bundle: "ui://items-ui/widgets/item-card.js",
  moduleId: "items-ui",
}

const alias: HostAliasWidgetDefinition = {
  id: "items-ui:kpi",
  requires: [],
  size: "quarter",
  moduleId: "items-ui",
  hostWidget: "shell:kpi-grid",
  presetProps: { title: "Items" },
}

describe("widget type guards", () => {
  it("isRemoteWidget is true only for the remote variant", () => {
    expect(isRemoteWidget(local)).toBe(false)
    expect(isRemoteWidget(remote)).toBe(true)
    // Aliases carry a moduleId but no bundle — must NOT count as remote,
    // or the browser loader would try to fetch a bundle that doesn't exist.
    expect(isRemoteWidget(alias)).toBe(false)
  })

  it("isHostAliasWidget is true only for the host-alias variant", () => {
    expect(isHostAliasWidget(local)).toBe(false)
    expect(isHostAliasWidget(remote)).toBe(false)
    expect(isHostAliasWidget(alias)).toBe(true)
  })
})
