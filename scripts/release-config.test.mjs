/**
 * The shape of the release path that no other check sees: the publish workflows, the PR-title
 * gate that guards the commit subject release-please reads, Dependabot's commit prefixes and the
 * root gate scripts. Run with `pnpm test:scripts` (node --test).
 */
import assert from "node:assert/strict"
import { readdirSync, readFileSync } from "node:fs"
import path from "node:path"
import { describe, it } from "node:test"
import { fileURLToPath } from "node:url"
import yaml from "js-yaml"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const read = (file) => readFileSync(path.join(root, file), "utf8")
const workflow = (name) => yaml.load(read(`.github/workflows/${name}`))
const steps = (job) => job.steps ?? []

describe("release-please.yml", () => {
  const { permissions, jobs } = workflow("release-please.yml")
  const publishJobs = Object.entries(jobs).filter(([, job]) =>
    String(job.uses).endsWith("publish-npm-package.yml"),
  )

  it("lets the GITHUB_TOKEN only read; release-please writes with the App's token", () => {
    assert.deepEqual(permissions, { contents: "read" })
    assert.equal(jobs["dry-run"].permissions.contents, "read")
  })

  it("publishes the runtime packages before the code that imports them", () => {
    assert.deepEqual(publishJobs.map(([id]) => id).sort(), [
      "publish-tool-codegen",
      "publish-tool-codegen-core",
      "publish-tool-codegen-react",
    ])
    assert.ok(jobs["publish-tool-codegen-react"].needs.includes("publish-tool-codegen-core"))
    for (const runtime of ["publish-tool-codegen-core", "publish-tool-codegen-react"]) {
      assert.ok(jobs["publish-tool-codegen"].needs.includes(runtime), runtime)
    }
  })

  it("publishes by force_publish from main only", () => {
    for (const [id, job] of publishJobs) {
      assert.match(job.if, /inputs\.force_publish && github\.ref == 'refs\/heads\/main'/, id)
    }
  })

  it("keeps no token in the dry run's checkout", () => {
    const checkout = steps(jobs["dry-run"]).find((step) =>
      step.uses?.startsWith("actions/checkout@"),
    )
    assert.equal(checkout.with?.["persist-credentials"], false)
  })
})

describe("publish-npm-package.yml", () => {
  const { permissions, jobs } = workflow("publish-npm-package.yml")
  const tokenJobs = Object.entries(jobs).filter(
    ([, job]) => job.permissions?.["id-token"] === "write",
  )

  it("asks for the id-token in one job only, in the npm environment", () => {
    assert.deepEqual(permissions, { contents: "read" })
    assert.deepEqual(
      tokenJobs.map(([id, job]) => [id, job.environment]),
      [["publish", "npm"]],
    )
  })

  // Any build-time dependency could mint an npm token in a job that installs or builds.
  it("runs no package manager, no repository code and no cache where the id-token is", () => {
    for (const [, job] of tokenJobs) {
      for (const step of steps(job)) {
        assert.ok(!step.uses?.startsWith("actions/checkout@"), "no checkout")
        assert.equal(step.with?.cache, undefined, "no dependency cache")
        assert.doesNotMatch(
          step.run ?? "",
          /\b(?:pnpm|yarn|npx)\b|\bnpm (?:ci|install|i|run|exec)\b/,
        )
      }
      const publish = steps(job).find((step) => /\bnpm publish\b/.test(step.run ?? ""))
      assert.match(publish.run, /--ignore-scripts/)
      assert.match(publish.run, /--provenance/)
    }
  })

  it("keeps no token in the pack job's checkout", () => {
    const checkout = steps(jobs.pack).find((step) => step.uses?.startsWith("actions/checkout@"))
    assert.equal(checkout.with?.["persist-credentials"], false)
  })
})

describe("pr-title.yml", () => {
  // A single-commit PR is squashed under its commit's subject, which decides the release.
  it("also validates a single commit's subject, and that it matches the title", () => {
    const [step] = workflow("pr-title.yml").jobs.lint.steps
    assert.equal(step.with?.validateSingleCommit, true)
    assert.equal(step.with?.validateSingleCommitMatchesPrTitle, true)
  })
})

describe("dependabot.yml", () => {
  it("writes no feat commits, which would cut a feature release for a dependency bump", () => {
    const updates = yaml.load(read(".github/dependabot.yml")).updates
    const byEcosystem = Object.fromEntries(
      updates.map((entry) => [entry["package-ecosystem"], entry]),
    )
    assert.deepEqual(byEcosystem.npm["commit-message"], {
      prefix: "fix",
      "prefix-development": "chore",
      include: "scope",
    })
    assert.deepEqual(byEcosystem["github-actions"]["commit-message"], { prefix: "ci" })
  })
})

describe("the root gate scripts", () => {
  const { scripts } = JSON.parse(read("package.json"))
  const packages = Object.fromEntries(
    readdirSync(path.join(root, "packages")).map((dir) => {
      const manifest = JSON.parse(read(`packages/${dir}/package.json`))
      return [manifest.name, manifest]
    }),
  )

  /** The packages a gate script runs `script` in, one `--filter` each. */
  const gatedPackages = (gate, script) =>
    [...scripts[gate].matchAll(/--filter (\S+) run (\S+)/g)].map(([, name, run]) => {
      assert.equal(run, script, `${gate} runs ${run}`)
      return name
    })

  // `pnpm -r --if-present` would go green with a script renamed away; a single-package filter
  // fails on a missing script.
  it("name every package the coverage and mutation gates cover, each defining the script", () => {
    const gates = {
      "test:coverage": [
        "@miragon/mcp-toolkit-tool-codegen",
        "@miragon/mcp-toolkit-tool-codegen-core",
        "@miragon/mcp-toolkit-tool-codegen-react",
      ],
      "test:mutation": [
        "@miragon/mcp-toolkit-tool-codegen",
        "@miragon/mcp-toolkit-tool-codegen-core",
      ],
    }
    for (const [gate, expected] of Object.entries(gates)) {
      assert.doesNotMatch(scripts[gate], /--if-present/)
      assert.match(scripts[gate], /^(?:pnpm --fail-if-no-match --filter \S+ run \S+(?: && |$))+$/)
      assert.deepEqual(gatedPackages(gate, gate), expected)
      for (const name of expected)
        assert.ok(packages[name]?.scripts?.[gate], `${name} defines ${gate}`)
    }
  })
})
