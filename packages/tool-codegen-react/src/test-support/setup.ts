import { cleanup } from "@testing-library/react"
import { afterEach } from "vitest"

// Testing Library unmounts after each test only when `afterEach` is a global; vitest's is not.
afterEach(cleanup)
