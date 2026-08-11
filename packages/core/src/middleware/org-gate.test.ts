import { describe, expect, it, vi } from "vitest"
import { createOrgGateMiddleware } from "./org-gate.js"

/**
 * The org gate is a SECURITY boundary: a mismatched or missing
 * `organization_id` claim must reject the RPC *before* the handler runs.
 * The two error messages reach clients verbatim, so they are pinned exactly —
 * changing them changes what every consuming client (and user) reads.
 */

const NO_ORG_MESSAGE =
  "Access denied: no organization context in the token. Authenticate with the correct organization."
const MISMATCH_MESSAGE = "Access denied: user is not a member of this organization."

describe("createOrgGateMiddleware", () => {
  it("is a pass-through when orgId is undefined: next() runs once and its result is returned", async () => {
    const gate = createOrgGateMiddleware(undefined)
    const sentinel = { handled: true }
    const next = vi.fn(() => Promise.resolve(sentinel))

    // Even a token from a *different* org passes — the gate is disabled.
    const result = await gate({ auth: { user: { organization_id: "org-other" } } }, next)

    expect(result).toBe(sentinel)
    expect(next).toHaveBeenCalledTimes(1)
  })

  it("treats an empty-string orgId as disabled too (the `!orgId` falsy check)", async () => {
    const gate = createOrgGateMiddleware("")
    const next = vi.fn(() => Promise.resolve("ok"))
    await expect(gate({}, next)).resolves.toBe("ok")
    expect(next).toHaveBeenCalledTimes(1)
  })

  it("rejects a token without organization_id with the exact message and never calls next", async () => {
    const gate = createOrgGateMiddleware("org-1")
    const next = vi.fn(() => Promise.resolve("ok"))

    await expect(gate({ auth: { user: {} } }, next)).rejects.toThrowError(new Error(NO_ORG_MESSAGE))
    expect(next).not.toHaveBeenCalled()
  })

  it("rejects when there is no auth context at all (same no-org error), next never called", async () => {
    const gate = createOrgGateMiddleware("org-1")
    const next = vi.fn(() => Promise.resolve("ok"))

    await expect(gate({}, next)).rejects.toThrowError(new Error(NO_ORG_MESSAGE))
    expect(next).not.toHaveBeenCalled()
  })

  it("rejects a token from another organization with the exact message and never calls next", async () => {
    const gate = createOrgGateMiddleware("org-1")
    const next = vi.fn(() => Promise.resolve("ok"))

    await expect(gate({ auth: { user: { organization_id: "org-2" } } }, next)).rejects.toThrowError(
      new Error(MISMATCH_MESSAGE),
    )
    expect(next).not.toHaveBeenCalled()
  })

  it("lets a matching organization through and returns next's result", async () => {
    const gate = createOrgGateMiddleware("org-1")
    const sentinel = { handled: true }
    const next = vi.fn(() => Promise.resolve(sentinel))

    const result = await gate({ auth: { user: { organization_id: "org-1" } } }, next)

    expect(result).toBe(sentinel)
    expect(next).toHaveBeenCalledTimes(1)
  })
})
