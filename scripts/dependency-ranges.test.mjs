/**
 * What a consumer installs is a range, and CI tests the lowest version each range admits. A
 * published package's dependencies and peerDependencies are ranges, so npm can dedupe them against
 * the app's own copies, and its engines.node is a lower bound. Everything else stays an exact pin:
 * a published package's devDependencies and every private manifest's dependencies (saveExact in
 * pnpm-workspace.yaml; the pin action in ci.yml for the manifests without ranges). The lockfile
 * pins what the test matrix runs; the "Lower bounds" job runs the generator's tests on the lowest
 * Node.js its engines range allows and against the lowest versions of its dependencies, and the
 * React package's tests against the lowest versions of its peers. Run with `pnpm test:scripts`
 * (node --test).
 */
import assert from "node:assert/strict"
import { existsSync, readdirSync, readFileSync } from "node:fs"
import path from "node:path"
import { describe, it } from "node:test"
import { fileURLToPath } from "node:url"
import * as yaml from "js-yaml"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const read = (file) => readFileSync(path.join(root, file), "utf8")

/** The root manifest and one per workspace package (pnpm-workspace.yaml: `dir` or `dir/*`). */
const manifests = [
  "package.json",
  ...yaml.load(read("pnpm-workspace.yaml")).packages.flatMap((pattern) => {
    assert.match(pattern, /^[\w.-]+(?:\/\*)?$/, `unsupported workspace pattern ${pattern}`)
    if (!pattern.endsWith("/*")) return [`${pattern}/package.json`]
    const dir = pattern.slice(0, -2)
    return readdirSync(path.join(root, dir), { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => `${dir}/${entry.name}/package.json`)
  }),
].filter((file) => existsSync(path.join(root, file)))
const manifest = Object.fromEntries(manifests.map((file) => [file, JSON.parse(read(file))]))
const published = manifests.filter((file) => !manifest[file].private)
const unpublished = manifests.filter((file) => manifest[file].private)

const VERSION = String.raw`\d+\.\d+\.\d+`
const EXACT = new RegExp(`^${VERSION}$`)
const BOUND = String.raw`(?:\^|~|>=)(${VERSION})`
/** A caret, tilde or lower-bound range on a full version, or a union of them. */
const RANGE = new RegExp(`^${BOUND}(?: \\|\\| ${BOUND})*$`)
/** The lowest version a range admits: the bound of its first member. */
const lowerBound = (range) => new RegExp(`^${BOUND}`).exec(range)?.[1]
const major = (version) => Number(version.split(".")[0])

/** pnpm pack writes `workspace:^` and `workspace:~` as ranges, `workspace:*` as an exact version. */
const isRange = (spec) => RANGE.test(spec) || spec === "workspace:^" || spec === "workspace:~"
const isPin = (spec) => EXACT.test(spec) || spec === "workspace:*"

const entries = (file, ...fields) =>
  fields.flatMap((field) =>
    Object.entries(manifest[file][field] ?? {}).map(([name, spec]) => ({ field, name, spec })),
  )

describe("published packages", () => {
  it("are found", () => {
    assert.ok(published.length >= 3, published.join(", "))
    for (const file of published) assert.match(file, /^packages\//)
  })

  for (const file of published) {
    it(`${file}: every dependency and peer is a range`, () => {
      const installed = ["dependencies", "optionalDependencies", "peerDependencies"]
      for (const { field, name, spec } of entries(file, ...installed)) {
        assert.ok(
          isRange(spec),
          `${field} ${name}: "${spec}" is no range; write "^${spec.replace(/^\D*/, "")}" (pnpm saves exact versions, so edit the manifest by hand)`,
        )
      }
    })

    it(`${file}: every devDependency is an exact pin`, () => {
      for (const { name, spec } of entries(file, "devDependencies")) {
        assert.ok(isPin(spec), `devDependencies ${name}: "${spec}" is no exact version`)
      }
    })

    it(`${file}: engines.node is a lower bound, required with a bin`, () => {
      const node = manifest[file].engines?.node
      if (manifest[file].bin !== undefined) assert.notEqual(node, undefined, "engines.node")
      if (node !== undefined) assert.match(node, new RegExp(`^>=${VERSION}$`))
    })
  }
})

describe("private manifests", () => {
  for (const file of unpublished) {
    it(`${file}: every dependency and devDependency is an exact pin`, () => {
      const fields = ["dependencies", "optionalDependencies", "devDependencies"]
      for (const { field, name, spec } of entries(file, ...fields)) {
        assert.ok(isPin(spec), `${field} ${name}: "${spec}" is no exact version`)
      }
    })
  }
})

describe("ci.yml", () => {
  const { jobs } = yaml.load(read(".github/workflows/ci.yml"))
  const codegen = "packages/tool-codegen/package.json"
  const react = "packages/tool-codegen-react/package.json"
  const nodeFloor = lowerBound(manifest[codegen].engines.node)
  const lowerBoundSteps = jobs["lower-bounds"].steps

  /** The step that installs into `file`'s package, and the versions it names. */
  const floorInstall = (file) => {
    const step = lowerBoundSteps.find(
      ({ run }) => /\badd\b/.test(run ?? "") && run.includes(`--filter ${manifest[file].name} `),
    )
    assert.ok(step, `no step installs the lowest versions into ${file}`)
    const versions = Object.fromEntries(
      step.run
        .split(/\s+/)
        .map((word) => /^(@?[^@\s]+)@(\S+)$/.exec(word))
        .filter(Boolean)
        .map(([, name, version]) => [name, version]),
    )
    return { run: step.run, versions }
  }

  it("has the pin action read every manifest whose dependencies are exact pins", () => {
    const pin = jobs.quality.steps.find((step) =>
      step.uses?.startsWith("miragon/pin-npm-dependencies@"),
    )
    const listed = pin.with.files.split("\n").filter(Boolean)
    const pinned = manifests.filter(
      (file) => manifest[file].private || entries(file, "dependencies").length === 0,
    )
    assert.deepEqual(listed.sort(), pinned.sort())
  })

  it("tests the oldest Node.js line the packages support and the newest, the root's", () => {
    const floors = published
      .map((file) => manifest[file].engines?.node)
      .filter(Boolean)
      .map(lowerBound)
    const oldest = Math.min(...floors.map(major))
    assert.deepEqual(jobs.test.strategy.matrix.node, [
      oldest,
      major(lowerBound(manifest["package.json"].engines.node)),
    ])
  })

  it("runs the lower-bounds job on the lowest Node.js the generator's engines allow", () => {
    const setupNode = jobs["lower-bounds"].steps.find((step) =>
      step.uses?.startsWith("actions/setup-node@"),
    )
    assert.equal(String(setupNode.with["node-version"]), nodeFloor)
    assert.match(jobs["lower-bounds"].name, new RegExp(`\\(Node\\.js ${nodeFloor}, `))
  })

  it("installs the lowest version of every peer of the React package", () => {
    const peers = manifest[react].peerDependencies
    const install = floorInstall(react)
    const reactFloor = lowerBound(peers.react)
    const expected = {
      // react-dom and the React types move with react.
      react: reactFloor,
      "react-dom": reactFloor,
      "@types/react": reactFloor,
      "@types/react-dom": reactFloor,
    }
    for (const [name, spec] of Object.entries(peers)) {
      if (!spec.startsWith("workspace:")) expected[name] = lowerBound(spec)
    }
    assert.deepEqual(install.versions, expected)
    assert.match(install.run, /--save-exact/)
    assert.match(
      jobs["lower-bounds"].name,
      new RegExp(
        `React ${reactFloor}, TanStack Query ${lowerBound(peers["@tanstack/react-query"])}\\)$`,
      ),
    )
  })

  // The lockfile moves past these bounds, so only this job still runs them.
  it("installs the lowest version of every dependency of a published package", () => {
    for (const file of published) {
      const { dependencies } = manifest[file]
      if (Object.keys(dependencies ?? {}).length === 0) continue
      const install = floorInstall(file)
      const expected = Object.fromEntries(
        Object.entries(dependencies).map(([name, spec]) => [name, lowerBound(spec)]),
      )
      assert.deepEqual(install.versions, expected, file)
      assert.match(install.run, /--save-prod/)
    }
  })

  // Without these steps the job installs the lowest versions and tests nothing against them.
  it("builds and tests against the lowest versions, after installing them", () => {
    const commands = lowerBoundSteps.map(({ run }) => run ?? "")
    const lastInstall = commands.findLastIndex((run) => /\badd\b/.test(run))
    const after = commands.slice(lastInstall + 1)
    const filtered = (name, script) => `pnpm --fail-if-no-match --filter ${name} run ${script}`
    for (const command of [
      'pnpm --fail-if-no-match --filter "./packages/*" run build',
      filtered(manifest[react].name, "typecheck"),
      filtered(manifest[react].name, "test"),
      filtered(manifest[codegen].name, "test"),
    ]) {
      assert.ok(after.includes(command), `the job does not run: ${command}`)
    }
  })
})
