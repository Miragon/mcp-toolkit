// @vitest-environment happy-dom
import { useEffect } from "react"
import { afterEach, describe, expect, it } from "vitest"
import { useToast } from "../components/Toast.js"
import { TOOLKIT_MESSAGES } from "../locale/toolkit-messages.js"
import { renderWithEffects, type EffectRender } from "../render-effects.js"
import { WidgetFixtureHost } from "./widget-fixture.js"

/**
 * The harness's toast stack inside the host's locale scope, with its effects
 * running: a toast exists only after a widget's effect shows it, so the SSR
 * suite (`widget-fixture.render.test.tsx`) never sees its words. Its one
 * localized word is the dismiss button's name; it follows `globals.locale`
 * like `McpAppView`'s stack does, which holds only while the `ToastProvider`
 * sits inside the `ToolkitLocaleFallback`.
 */

/** A widget that reports a write's outcome as a toast once it mounts. */
function SavesOnMount() {
  const toast = useToast()
  useEffect(() => {
    toast.show({ tone: "success", title: "Saved" })
  }, [toast])
  return <p>widget</p>
}

let mounted: EffectRender | null = null

afterEach(async () => {
  await mounted?.unmount()
  mounted = null
})

/** The dismiss button's accessible name of the toast the widget raised. */
async function dismissLabel(globals?: Record<string, unknown>): Promise<string | null> {
  mounted = await renderWithEffects(<WidgetFixtureHost widget={SavesOnMount} globals={globals} />)
  const toast = mounted.container.querySelector('[data-slot="toast"]')
  expect(toast?.textContent, "the widget's toast reached the stack").toContain("Saved")
  return toast?.querySelector("button")?.getAttribute("aria-label") ?? null
}

describe("WidgetFixtureHost toast stack (effects)", () => {
  it("names a toast's dismiss button in globals.locale", async () => {
    expect(await dismissLabel({ locale: "de" })).toBe(TOOLKIT_MESSAGES.de.common.dismiss)
  })

  it("names it in English without a host locale", async () => {
    expect(await dismissLabel()).toBe(TOOLKIT_MESSAGES.en.common.dismiss)
    expect(TOOLKIT_MESSAGES.en.common.dismiss).not.toBe(TOOLKIT_MESSAGES.de.common.dismiss)
  })
})
