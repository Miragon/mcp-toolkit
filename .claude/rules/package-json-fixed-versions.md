---
paths:
  - "**/package.json"
---

# Exact pins in the workspace, ranges for consumers

What a consumer installs from npm is a range; everything else is an exact pin.

- `devDependencies`, and the `dependencies` of the private packages (the root, `examples/*`,
  `docs`), are exact versions (e.g. `"eslint": "10.14.0"`), never `^`, `~`, `>=` or `*`.
  `saveExact: true` in `pnpm-workspace.yaml` makes `pnpm add` write them so.
- The `dependencies` and `peerDependencies` of a published package (`packages/*`) are ranges, so
  consumers dedupe them against their own copies instead of installing a second copy or hitting a
  peer mismatch: `^` on the version (e.g. `"prettier": "^3.9.10"`), and `workspace:~` for the
  `@miragon/*` packages, which `pnpm pack` writes as `~<version>`. pnpm saves exact versions, so
  write these by hand after `pnpm add`, then run `pnpm install`.
- A published package's `engines.node` is a lower bound (`">=22.18.0"`).
- Each peer is also a devDependency (exact, or `workspace:*` for `@miragon/*`), so the workspace
  builds and tests against one known version; the lockfile pins what CI tests.

When adding a dependency: install it with `pnpm add`, read the installed version from
`pnpm-lock.yaml`, and write it exact or as `^<version>` per the rules above. Raising a lower bound
of a dependency, of a peer or of `engines.node` also moves the versions of the `Lower bounds` job
in `.github/workflows/ci.yml`. Dependabot does not raise a bound: it keeps a range that admits the
new version and moves the lockfile (`versioning-strategy: increase-if-necessary`).

`scripts/dependency-ranges.test.mjs` (`pnpm test:scripts`, in `Lint + Format`) checks every rule
above, and `miragon/pin-npm-dependencies` checks the exact pins of every manifest whose
dependencies are all exact.
