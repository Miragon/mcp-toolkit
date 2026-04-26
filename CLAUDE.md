# CLAUDE.md — `mcp-toolkit`

Project-specific guidance for AI agents and humans working in this repo.

## Testing policy

The repo moves fast. We test only what is supposed to be **stable** — the parts
where silent drift hurts downstream consumers. Use Vitest. Colocate the test
next to the source it covers (`foo.ts` → `foo.test.ts`).

### MUST have tests

- **Zod schemas** exported from any package (`*Schema`, `parse*Env`, `serialize*`).
- **Pure utility functions** (no I/O, no side effects): parsers, normalizers,
  path resolvers, naming helpers, layout transformers.
- **Registry / contract semantics**: collision detection, lookup, filtering.
- **Code generators' naming and output determinism** — the input → output
  mapping is the build-time-↔-runtime contract.
- **Fail-soft boundaries**: a function documented as "logs warning, doesn't
  throw" needs a test proving it doesn't throw on the bad path.

### SHOULD NOT have tests yet

- React rendering and widget glue (UI layer is moving).
- Plugin lifecycle and OAuth state machines (still being shaped — revisit
  once the flow stabilises).
- Middleware internals (better covered by integration tests once the auth
  model is settled).
- The `examples/` app — treat as a manual smoke surface.

### When you change tested code

- Update the test in the same PR. If the contract genuinely changed, replace
  the test with one that pins the new contract — don't delete it to make CI
  green.
- Don't loosen an assertion to dodge a failure. Either the code is wrong, or
  the contract has shifted and the test should describe the new contract.

### When you add a new package or public export

- New schema → new schema test.
- New pure utility → new test.
- Anything else → judgment call, lean toward "not yet".

If you need to test a private helper, **export it** rather than reaching into
the module. An explicit export is a clearer contract than a clever test.
