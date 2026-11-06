/**
 * The shape of the release path that no other check sees: the publish workflows, the PR-title
 * gate that guards the commit subject release-please reads, Dependabot's commit prefixes and its
 * cooldown, the root gate scripts and the scope of the required mutation gate. Run with
 * `pnpm test:scripts` (node --test).
 */
import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { after, describe, it } from "node:test"
import { fileURLToPath } from "node:url"
import yaml from "js-yaml"
import { inMutationScope } from "./mutation-scope.mjs"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const read = (file) => readFileSync(path.join(root, file), "utf8")
const workflow = (name) => yaml.load(read(`.github/workflows/${name}`))
const steps = (job) => job.steps ?? []
const isCheckout = (step) => step.uses?.startsWith("actions/checkout@")
const npmPublish = (job) => steps(job).find((step) => /\bnpm publish\b/.test(step.run ?? ""))
const rootScripts = JSON.parse(read("package.json")).scripts
const packageDirs = Object.fromEntries(
  readdirSync(path.join(root, "packages")).map((dir) => [
    JSON.parse(read(`packages/${dir}/package.json`)).name,
    `packages/${dir}`,
  ]),
)

/** The packages a gate script runs `script` in, one `--filter` each. */
const gatedPackages = (gate, script) =>
  [...rootScripts[gate].matchAll(/--filter (\S+) run (\S+)/g)].map(([, name, run]) => {
    assert.equal(run, script, `${gate} runs ${run}`)
    return name
  })

/** A temporary directory, removed after the tests. */
const scratchDirs = []
const scratch = () => {
  const dir = mkdtempSync(path.join(tmpdir(), "release-config-"))
  scratchDirs.push(dir)
  return dir
}
after(() => {
  for (const dir of scratchDirs) rmSync(dir, { recursive: true, force: true })
})

/** The environment without GIT_*, so a git hook's GIT_DIR never points a test at this repo. */
const isolatedEnv = Object.fromEntries(
  Object.entries(process.env).filter(([key]) => !key.startsWith("GIT_")),
)

describe("release-please.yml", () => {
  const { permissions, jobs } = workflow("release-please.yml")
  const publishJobs = Object.entries(jobs).filter(([, job]) =>
    String(job.uses).endsWith("publish-npm-package.yml"),
  )

  it("lets the GITHUB_TOKEN only read; release-please writes with the App's token", () => {
    assert.deepEqual(permissions, { contents: "read" })
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

  // A dry run of its own (pnpm publish -r --dry-run) missed the npm publish bug of #216.
  it("dry-runs through the publish jobs, with no job of its own", () => {
    assert.deepEqual(Object.keys(jobs).sort(), [
      ...publishJobs.map(([id]) => id).sort(),
      "release-please",
    ])
    assert.match(jobs["release-please"].if, /!inputs\.dry_run/)
    for (const [id, job] of publishJobs) {
      assert.match(job.if, /\(inputs\.dry_run \|\| /, id)
      assert.equal(
        job.with?.dry_run,
        "${{ github.event_name == 'workflow_dispatch' && inputs.dry_run }}",
        id,
      )
    }
  })

  it("publishes after a skipped release-please, never after a failed job", () => {
    for (const [id, job] of publishJobs) {
      assert.ok(job.if.startsWith("${{ !cancelled() && !failure() && ("), id)
    }
  })

  it("packs the tag release-please just created", () => {
    assert.equal(jobs["release-please"].outputs?.tag_name, "${{ steps.release.outputs.tag_name }}")
    for (const [id, job] of publishJobs) {
      assert.equal(job.with?.tag, "${{ needs.release-please.outputs.tag_name }}", id)
    }
  })
})

describe("publish-npm-package.yml", () => {
  const {
    on: {
      workflow_call: { inputs },
    },
    permissions,
    jobs,
  } = workflow("publish-npm-package.yml")
  const tokenJobs = Object.entries(jobs).filter(
    ([, job]) => job.permissions?.["id-token"] === "write",
  )
  const resolveTag = steps(jobs.pack).find((step) => step.id === "release")
  const packStep = steps(jobs.pack).find((step) => step.id === "pack")

  /**
   * Runs a step's script in a scratch checkout holding `files`, with the commands in `stubs`
   * (name → bash script) first on the PATH; returns its exit status, outputs and log.
   */
  const runStep = (step, { files, stubs, env }) => {
    const dir = scratch()
    const [bin, checkout, runnerTemp] = ["bin", "checkout", "runner-temp"].map((name) => {
      mkdirSync(path.join(dir, name))
      return path.join(dir, name)
    })
    for (const [name, script] of Object.entries(stubs)) {
      writeFileSync(path.join(bin, name), `#!/usr/bin/env bash\n${script}`)
      chmodSync(path.join(bin, name), 0o755)
    }
    for (const [file, content] of Object.entries(files)) {
      mkdirSync(path.dirname(path.join(checkout, file)), { recursive: true })
      writeFileSync(path.join(checkout, file), content)
    }
    writeFileSync(path.join(dir, "step.sh"), step.run)
    const output = path.join(dir, "output")
    writeFileSync(output, "")
    // bash -e is how GitHub runs a step without a shell of its own.
    const run = spawnSync("bash", ["-e", path.join(dir, "step.sh")], {
      cwd: checkout,
      encoding: "utf8",
      env: {
        PATH: `${bin}${path.delimiter}${process.env.PATH}`,
        GITHUB_OUTPUT: output,
        RUNNER_TEMP: runnerTemp,
        ...env,
      },
    })
    const outputs = Object.fromEntries(
      readFileSync(output, "utf8")
        .split("\n")
        .filter(Boolean)
        .map((line) => line.split("=")),
    )
    return { status: run.status, outputs, log: run.stdout + run.stderr }
  }

  /** Runs the pack job's "Resolve the release tag" step against a stubbed `gh api`. */
  const runResolveTag = ({ tag = "", dryRun = false, version = "3.0.1", tags = [] }) =>
    runStep(resolveTag, {
      files: { "package.json": JSON.stringify({ version }) },
      // gh api --silent repos/<repo>/git/ref/tags/<tag>: found only for the tags in STUB_TAGS.
      stubs: {
        gh:
          'tag="${!#}"; tag="${tag##*/tags/}"\n' +
          'for t in $STUB_TAGS; do [ "$t" = "$tag" ] && exit 0; done\n' +
          'echo "gh: Not Found (HTTP 404)" >&2; exit 1\n',
      },
      env: {
        TAG: tag,
        DRY_RUN: String(dryRun),
        GITHUB_REPOSITORY: "Miragon/mcp-toolkit",
        GITHUB_SHA: "0123abcd",
        STUB_TAGS: tags.join(" "),
      },
    })

  /** Runs the pack job's "Pack" step for tool-codegen against a stubbed `npm view` and `pnpm pack`. */
  const codegen = "@miragon/mcp-toolkit-tool-codegen"
  const runPack = ({ tag, version, published }) =>
    runStep(packStep, {
      files: { "packages/tool-codegen/package.json": JSON.stringify({ name: codegen, version }) },
      stubs: {
        // npm view <name>@<version> version: found only for the specs in STUB_PUBLISHED.
        npm:
          '[ "$1" = view ] || exit 2\n' +
          'for p in $STUB_PUBLISHED; do [ "$p" = "$2" ] && exit 0; done\n' +
          "exit 1\n",
        // pnpm pack --pack-destination <dir>, in the package: the tarball of its version.
        pnpm:
          '[ "$1 $2" = "pack --pack-destination" ] || exit 2\n' +
          `touch "$3/package-$(node -p "require('./package.json').version").tgz"\n`,
      },
      env: { PACKAGE: "tool-codegen", TAG: tag, STUB_PUBLISHED: published.join(" ") },
    })

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
        assert.ok(!isCheckout(step), "no checkout")
        assert.equal(step.with?.cache, undefined, "no dependency cache")
        assert.doesNotMatch(
          step.run ?? "",
          /\b(?:pnpm|yarn|npx)\b|\bnpm (?:ci|install|i|run|exec)\b/,
        )
      }
      const publish = npmPublish(job)
      assert.match(publish.run, /--ignore-scripts/)
      assert.match(publish.run, /--provenance/)
    }
  })

  // Without ./ npm takes "tarball/<file>.tgz" for a GitHub owner/repo and runs git ls-remote
  // (the failed 3.0.0 publish).
  it("publishes the tarball by a ./ path, never a bare relative one", () => {
    assert.match(npmPublish(jobs.publish).run, /\bnpm publish "\.\//)
  })

  it("keeps no token in the pack job's checkouts", () => {
    const checkouts = steps(jobs.pack).filter(isCheckout)
    assert.equal(checkouts.length, 2)
    for (const checkout of checkouts) assert.equal(checkout.with?.["persist-credentials"], false)
  })

  it("takes the release tag and the dry run as inputs", () => {
    assert.deepEqual(inputs.tag, { ...inputs.tag, type: "string", required: false, default: "" })
    assert.deepEqual(inputs.dry_run, {
      ...inputs.dry_run,
      type: "boolean",
      required: false,
      default: false,
    })
  })

  // The real publish command, so a dry run fails where the publish would (#216).
  it("dry-runs the publish job's steps with --dry-run, without the id-token or the environment", () => {
    const dryRun = jobs["publish-dry-run"]
    assert.equal(jobs.publish.if, "needs.pack.outputs.published == 'false' && !inputs.dry_run")
    assert.equal(dryRun.if, "needs.pack.outputs.published == 'false' && inputs.dry_run")
    assert.equal(dryRun.needs, "pack")
    assert.deepEqual(dryRun.permissions, { contents: "read" })
    assert.equal(dryRun.environment, undefined)
    const publishCommand = npmPublish(jobs.publish).run
    assert.equal(npmPublish(dryRun).run, `${publishCommand} --dry-run`)
    assert.deepEqual(
      steps(dryRun).map((step) =>
        step.run === `${publishCommand} --dry-run` ? { ...step, run: publishCommand } : step,
      ),
      steps(jobs.publish),
    )
  })

  // force_publish must not publish what main holds at dispatch time.
  it("builds and packs the checkout of the resolved release tag", () => {
    const [readVersion, tagCheckout] = steps(jobs.pack).filter(isCheckout)
    assert.equal(readVersion.with?.ref, undefined)
    assert.equal(tagCheckout.with?.ref, "${{ steps.release.outputs.ref }}")
    // Only reading the version comes before it: the toolchain setup, install and build see the tag.
    const tagCheckoutAt = steps(jobs.pack).indexOf(tagCheckout)
    assert.deepEqual(steps(jobs.pack).slice(0, tagCheckoutAt), [readVersion, resolveTag])
    assert.equal(
      steps(jobs.pack).find((step) => step.id === "pack").env?.TAG,
      "${{ steps.release.outputs.tag }}",
    )
  })

  it("resolves release-please's tag, else the tag of the version in package.json", () => {
    assert.deepEqual(runResolveTag({ tag: "v3.1.0", tags: ["v3.1.0"] }).outputs, {
      tag: "v3.1.0",
      ref: "refs/tags/v3.1.0",
    })
    assert.deepEqual(runResolveTag({ version: "3.0.1", tags: ["v3.0.1"] }).outputs, {
      tag: "v3.0.1",
      ref: "refs/tags/v3.0.1",
    })
  })

  it("fails a publish without the tag; only a dry run packs the calling commit", () => {
    const publish = runResolveTag({ version: "3.0.2", tags: ["v3.0.1"] })
    assert.notEqual(publish.status, 0)
    assert.deepEqual(publish.outputs, {})
    assert.match(publish.log, /There is no tag v3\.0\.2/)
    const dryRun = runResolveTag({ version: "3.0.2", tags: ["v3.0.1"], dryRun: true })
    assert.equal(dryRun.status, 0)
    assert.deepEqual(dryRun.outputs, { tag: "v3.0.2", ref: "0123abcd" })
  })

  it("refuses a tag that is not v<version>", () => {
    for (const tag of ["3.0.1", "v3.0", "main", "v3.0.1 --flag"]) {
      const run = runResolveTag({ tag, tags: [tag], dryRun: true })
      assert.notEqual(run.status, 0, tag)
      assert.deepEqual(run.outputs, {}, tag)
    }
  })

  // Else a tag that holds an older version would be skipped as already published.
  it("refuses to pack a package whose version is not the tag's", () => {
    const run = runPack({ tag: "v3.0.1", version: "3.0.0", published: [`${codegen}@3.0.0`] })
    assert.notEqual(run.status, 0)
    assert.deepEqual(run.outputs, {})
    assert.match(run.log, /@miragon\/mcp-toolkit-tool-codegen is at 3\.0\.0 in v3\.0\.1/)
  })

  it("skips a version that is on npm and packs one that is not", () => {
    const published = runPack({ tag: "v3.0.1", version: "3.0.1", published: [`${codegen}@3.0.1`] })
    assert.equal(published.status, 0)
    assert.deepEqual(published.outputs, { published: "true" })
    const fresh = runPack({ tag: "v3.0.1", version: "3.0.1", published: [`${codegen}@3.0.0`] })
    assert.equal(fresh.status, 0)
    assert.deepEqual(fresh.outputs, { tarball: "package-3.0.1.tgz", published: "false" })
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
  const updates = yaml.load(read(".github/dependabot.yml")).updates
  const byEcosystem = Object.fromEntries(
    updates.map((entry) => [entry["package-ecosystem"], entry]),
  )

  it("writes no feat commits, which would cut a feature release for a dependency bump", () => {
    assert.deepEqual(byEcosystem.npm["commit-message"], {
      prefix: "fix",
      "prefix-development": "chore",
      include: "scope",
    })
    assert.deepEqual(byEcosystem["github-actions"]["commit-message"], { prefix: "ci" })
  })

  // Dependabot runs pnpm with a cooldown longer than pnpm's own window as the minimum release age,
  // and pnpm checks every locked version against it: every update fails on a version that window
  // let into the lockfile. A shorter cooldown is dead config, since Dependabot raises it to pnpm's
  // window.
  it("cools npm updates down for exactly pnpm's minimumReleaseAge, one window for every type", () => {
    const { minimumReleaseAge } = yaml.load(read("pnpm-workspace.yaml"))
    const days = minimumReleaseAge / (24 * 60)
    assert.ok(Number.isInteger(days) && days > 0, `minimumReleaseAge ${minimumReleaseAge}`)
    assert.deepEqual(byEcosystem.npm.cooldown, { "default-days": days })
  })
})

describe("the root gate scripts", () => {
  const packages = Object.fromEntries(
    Object.entries(packageDirs).map(([name, dir]) => [
      name,
      JSON.parse(read(`${dir}/package.json`)),
    ]),
  )

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
      assert.doesNotMatch(rootScripts[gate], /--if-present/)
      assert.match(
        rootScripts[gate],
        /^(?:pnpm --fail-if-no-match --filter \S+ run \S+(?: && |$))+$/,
      )
      assert.deepEqual(gatedPackages(gate, gate), expected)
      for (const name of expected)
        assert.ok(packages[name]?.scripts?.[gate], `${name} defines ${gate}`)
    }
  })
})

describe("ci.yml", () => {
  const ci = workflow("ci.yml")
  const { changes, mutation } = ci.jobs

  // The ruleset requires these checks by job name.
  it("keeps the names of the required checks", () => {
    assert.equal(ci.jobs.build.name, "Typecheck + Build")
    assert.equal(ci.jobs.quality.name, "Lint + Format")
    assert.equal(mutation.name, "Mutation diff gate")
  })

  // A required check whose workflow never starts stays pending and blocks the merge.
  it("filters no paths at the workflow level", () => {
    for (const [event, filter] of Object.entries(ci.on)) {
      for (const key of ["paths", "paths-ignore"]) assert.equal(filter?.[key], undefined, event)
    }
  })

  it("skips the mutation gate only on the changes job's explicit false", () => {
    assert.deepEqual([mutation.needs].flat(), ["changes"])
    assert.equal(
      mutation.if,
      "${{ github.event_name == 'pull_request' && !cancelled() && needs.changes.outputs.mutation != 'false' }}",
    )
    assert.equal(changes.outputs?.mutation, "${{ steps.scope.outputs.mutation }}")
  })

  it("decides the scope on the pull request's whole diff against its base", () => {
    const checkout = steps(changes).find(isCheckout)
    assert.equal(checkout.with?.["fetch-depth"], 2)
    assert.equal(checkout.with?.ref, undefined, "the merge commit, whose first parent is the base")
    const scope = steps(changes).find((step) => step.id === "scope")
    assert.equal(scope.run, 'node scripts/mutation-scope.mjs HEAD^1 HEAD >> "$GITHUB_OUTPUT"')
  })
})

describe("mutation-scope.mjs", () => {
  const script = path.join(root, "scripts/mutation-scope.mjs")
  const mutated = gatedPackages("test:mutation", "test:mutation").map((name) => packageDirs[name])

  /** Runs the script in a fresh git repository: one commit with `before`, one after `change`. */
  const scopeOfCommit = (before, change) => {
    const dir = scratch()
    const git = (...args) => {
      const config = {
        "user.name": "test",
        "user.email": "test@example.com",
        "commit.gpgsign": "false",
        "core.hooksPath": "/dev/null",
      }
      const flags = Object.entries(config).flatMap(([key, value]) => ["-c", `${key}=${value}`])
      const run = spawnSync("git", [...flags, ...args], { cwd: dir, env: isolatedEnv })
      assert.equal(run.status, 0, `git ${args.join(" ")}: ${run.stderr}`)
    }
    git("init", "--quiet")
    for (const [file, content] of Object.entries(before)) {
      mkdirSync(path.dirname(path.join(dir, file)), { recursive: true })
      writeFileSync(path.join(dir, file), content)
    }
    git("add", ".")
    git("commit", "--quiet", "-m", "before")
    change(git, dir)
    git("commit", "--quiet", "--all", "-m", "change")
    return spawnSync(process.execPath, [script, "HEAD^1", "HEAD"], {
      cwd: dir,
      encoding: "utf8",
      env: isolatedEnv,
    })
  }

  it("reaches what the gate mutates, what its tests read, the toolchain and the gate", () => {
    assert.deepEqual(mutated, ["packages/tool-codegen", "packages/tool-codegen-core"])
    const strykerConfigs = Object.values(packageDirs)
      .map((dir) => `${dir}/stryker.config.json`)
      .filter((file) => existsSync(path.join(root, file)))
    assert.deepEqual(
      strykerConfigs.sort(),
      mutated.map((dir) => `${dir}/stryker.config.json`).sort(),
    )
    for (const file of [
      ...mutated.flatMap((dir) => [
        `${dir}/src/index.ts`,
        `${dir}/src/index.test.ts`,
        `${dir}/package.json`,
        `${dir}/vitest.config.ts`,
        `${dir}/tsconfig.json`,
      ]),
      ...strykerConfigs,
      "packages/tool-codegen/templates/tools.ts.hbs",
      "packages/tool-codegen-react/src/hooks.tsx",
      "packages/tool-codegen-react/package.json",
      "package.json",
      "pnpm-lock.yaml",
      "pnpm-workspace.yaml",
      "tsconfig.base.json",
      ".github/workflows/ci.yml",
      "scripts/mutation-scope.mjs",
    ]) {
      assert.ok(inMutationScope([file]), file)
    }
  })

  it("leaves out the docs, the example, the READMEs and the other workflows", () => {
    assert.equal(inMutationScope([]), false)
    for (const file of [
      "docs/index.md",
      "docs/package.json",
      "examples/tasks/src/server.ts",
      "examples/tasks/package.json",
      "README.md",
      "CONTRIBUTING.md",
      "CLAUDE.md",
      "packages/tool-codegen/README.md",
      "packages/tool-codegen-core/LICENSE",
      ".github/workflows/release-please.yml",
      ".github/workflows/publish-npm-package.yml",
      "scripts/release-config.test.mjs",
      "eslint.config.mjs",
    ]) {
      assert.equal(inMutationScope([file]), false, file)
    }
  })

  it("prints the scope of a diff", () => {
    const outOfScope = scopeOfCommit({ "docs/index.md": "a" }, (_, dir) =>
      writeFileSync(path.join(dir, "docs/index.md"), "b"),
    )
    assert.equal(outOfScope.stdout, "mutation=false\n")
    const inScope = scopeOfCommit({ "packages/tool-codegen/src/a.ts": "a" }, (_, dir) =>
      writeFileSync(path.join(dir, "packages/tool-codegen/src/a.ts"), "b"),
    )
    assert.equal(inScope.stdout, "mutation=true\n")
  })

  it("counts a file moved out of a mutated package", () => {
    const before = { "packages/tool-codegen/src/a.ts": "a\n".repeat(20), "docs/index.md": "b" }
    const run = scopeOfCommit(before, (git) => {
      git("mv", "packages/tool-codegen/src/a.ts", "docs/a.ts")
    })
    assert.equal(run.stdout, "mutation=true\n")
  })

  // Without -z git prints such a path quoted ("packages/…\303\244.hbs"), which no pattern matches.
  it("counts a path with a non-ASCII character in a mutated package", () => {
    const run = scopeOfCommit({ "docs/index.md": "a" }, (git, dir) => {
      mkdirSync(path.join(dir, "packages/tool-codegen/templates"), { recursive: true })
      writeFileSync(path.join(dir, "packages/tool-codegen/templates/ä.hbs"), "b")
      git("add", ".")
    })
    assert.equal(run.stdout, "mutation=true\n")
  })

  // ci.yml reads a missing output as "run the gate".
  it("prints nothing and fails when git fails", () => {
    const run = spawnSync(process.execPath, [script, "no-such-rev", "HEAD"], {
      cwd: scratch(),
      encoding: "utf8",
      env: isolatedEnv,
    })
    assert.notEqual(run.status, 0)
    assert.equal(run.stdout, "")
  })
})
