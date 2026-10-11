/**
 * Effect-running renders for the WIRING tests SSR cannot see: effects,
 * subscriptions and timers of the view lifecycle and the data hooks
 * (toolkit#176 review). `react-dom/client` + `act` in a test file that opts
 * into a DOM with `// @vitest-environment happy-dom`. Not an interaction kit:
 * the house render path stays SSR (`renderToStaticMarkup`), and these tests
 * drive hooks through their inputs; a `click()` only where the wiring starts
 * at a button.
 */
import { act, useEffect, type ReactNode } from "react"
import { createRoot } from "react-dom/client"

// React warns about updates outside act() unless the runtime says it is a test.
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

/**
 * Run `work` in an ASYNC act scope: the promises it starts (a tool call that
 * resolves, a state update after it) settle, and their renders commit,
 * before the scope ends.
 */
export function inAct(work: () => unknown): Promise<void> {
  return act(() => {
    work()
    return Promise.resolve()
  })
}

export interface EffectRender {
  container: HTMLElement
  /** Render `node` into the same root (a new host state, new props). */
  rerender: (node: ReactNode) => Promise<void>
  /** Unmount and run the cleanups; a second call does nothing. */
  unmount: () => Promise<void>
}

/** Mount `node` and run its effects. */
export async function renderWithEffects(node: ReactNode): Promise<EffectRender> {
  const container = document.createElement("div")
  document.body.append(container)
  const root = createRoot(container)
  await inAct(() => root.render(node))
  let mounted = true
  return {
    container,
    rerender: (next) => inAct(() => root.render(next)),
    unmount: async () => {
      if (!mounted) return
      mounted = false
      await inAct(() => root.unmount())
      container.remove()
    },
  }
}

/**
 * Settle pending promises and the effects and renders they cause, with real
 * timers: TanStack Query notifies its observers on a 0 ms timer, so each
 * round lets one land (under fake timers use {@link advanceTimers}).
 */
export async function flushEffects(rounds = 3): Promise<void> {
  for (let round = 0; round < rounds; round++) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
  }
}

/** Advance fake timers by `ms` inside act, so the renders they cause commit. */
export function advanceTimers(advance: (ms: number) => unknown, ms: number): Promise<void> {
  return inAct(() => advance(ms))
}

/**
 * Renders `useValue` in a probe and keeps its latest committed value: read
 * `current` after a render or flush.
 */
export function hookProbe<T>(useValue: () => T): {
  Probe: () => null
  current: () => T
} {
  const box: { value?: { current: T } } = {}
  function Probe(): null {
    const value = useValue()
    useEffect(() => {
      box.value = { current: value }
    })
    return null
  }
  return {
    Probe,
    current: () => {
      if (!box.value) throw new Error("the probe has not committed yet")
      return box.value.current
    },
  }
}
