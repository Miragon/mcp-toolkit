/**
 * The shape of the release path that no other check sees: the publish workflows, the PR-title
 * gate that guards the commit subject release-please reads, Dependabot's commit prefixes and its
 * cooldown, the root gate scripts, the required mutation gate and the nightly mutation run. Run
 * with `pnpm test:scripts` (node --test).
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
import * as yaml from "js-yaml"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const read = (file) => readFileSync(path.join(root, file), "utf8")
const workflow = (name) => yaml.load(read(`.github/workflows/${name}`))
const steps = (job) => job.steps ?? []
const isCheckout = (step) => step.uses?.startsWith("actions/checkout@")
const npmPublish = (job) => steps(job).find((step) => /\bnpm publish\b/.test(step.run ?? ""))
const commands = (job) => steps(job).flatMap((step) => step.run ?? [])
const artifactUpload = (job) =>
  steps(job).find((step) => step.uses?.startsWith("actions/upload-artifact@"))
/** Fails on what would keep a gate green without running its commands or despite their failure. */
const assertFailureFailsJob = (job) => {
  assert.equal(job["continue-on-error"], undefined)
  for (const step of steps(job)) {
    assert.equal(step["continue-on-error"], undefined, step.run ?? step.uses)
    if (step.run) assert.equal(step.if, undefined, step.run)
  }
}
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

  /** Runs the pack job's "Resolve the release tag" step against a stubbed `gh api`. */
  const runResolveTag = ({
    tag = "",
    dryRun = false,
    version = "3.0.1",
    tags = [],
    apiDown = false,
  }) =>
    runStep(resolveTag, {
      files: { "package.json": JSON.stringify({ version }) },
      // gh api --silent repos/<repo>/git/ref/tags/<tag>: found only for the tags in STUB_TAGS;
      // with STUB_API_DOWN every lookup fails with a server error.
      stubs: {
        gh:
          '[ -n "$STUB_API_DOWN" ] && { echo "gh: Bad Gateway (HTTP 502)" >&2; exit 1; }\n' +
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
        STUB_API_DOWN: apiDown ? "1" : "",
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

  it("stops on a failed tag lookup that is not a 404, dry run included", () => {
    for (const dryRun of [false, true]) {
      const run = runResolveTag({ version: "3.0.2", tags: ["v3.0.2"], dryRun, apiDown: true })
      assert.notEqual(run.status, 0, `dryRun=${dryRun}`)
      assert.deepEqual(run.outputs, {}, `dryRun=${dryRun}`)
      assert.match(run.log, /Could not look up the tag v3\.0\.2: .*HTTP 502/)
    }
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

  // With the published packages' ranges, an update moves the lockfile and nothing a consumer
  // installs, so it cuts no release at all.
  it("writes neither feat nor fix commits, which would cut a release for a dependency bump", () => {
    assert.deepEqual(byEcosystem.npm["commit-message"], { prefix: "chore", include: "scope" })
    assert.deepEqual(byEcosystem["github-actions"]["commit-message"], { prefix: "ci" })
  })

  // The default treats the private root as an app and raises the lower bound of every published
  // range on every update.
  it("keeps a published range that already admits the new version", () => {
    assert.equal(byEcosystem.npm["versioning-strategy"], "increase-if-necessary")
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

  // Else a package's new Stryker config would never run: test:mutation is all CI runs of it.
  it("leave no package with a Stryker config out of test:mutation", () => {
    const strykerConfigs = Object.values(packageDirs)
      .map((dir) => `${dir}/stryker.config.json`)
      .filter((file) => existsSync(path.join(root, file)))
    assert.deepEqual(
      strykerConfigs.sort(),
      gatedPackages("test:mutation", "test:mutation")
        .map((name) => `${packageDirs[name]}/stryker.config.json`)
        .sort(),
    )
  })

  // Stryker fails a run only below thresholds.break, and never with a break of null: the threshold
  // and the script are what let a mutation gate go red. The generator's break may rise.
  it("run Stryker itself, with a break of 100 in core and at least 95 in the generator", () => {
    const codegen = "@miragon/mcp-toolkit-tool-codegen"
    const core = "@miragon/mcp-toolkit-tool-codegen-core"
    const stryker = (name) => JSON.parse(read(`${packageDirs[name]}/stryker.config.json`))
    assert.equal(stryker(core).thresholds.break, 100)
    const codegenBreak = stryker(codegen).thresholds.break
    assert.ok(codegenBreak >= 95, `the generator's break is ${codegenBreak}`)
    for (const name of [codegen, core]) {
      assert.equal(packages[name].scripts["test:mutation"], "stryker run", name)
      // Where the workflows upload it from, which only warns on a missing file.
      assert.equal(stryker(name).jsonReporter.fileName, "reports/mutation/mutation.json", name)
    }
  })
})

describe("ci.yml", () => {
  const ci = workflow("ci.yml")
  const { mutation } = ci.jobs

  // The ruleset requires these checks by job name.
  it("keeps the names of the required checks", () => {
    assert.equal(ci.jobs.build.name, "Typecheck + Build")
    assert.equal(ci.jobs.quality.name, "Lint + Format")
    assert.equal(mutation.name, "Mutation diff gate")
  })

  // A matrix names its checks per leg, so the required name belongs to a job that needs them all.
  // The lower bounds count too: Dependabot's auto-merge waits for required checks only.
  it("passes the required build check only when every Node.js leg and the lower bounds passed", () => {
    const { build, test } = ci.jobs
    assert.ok(test.strategy.matrix.node.length >= 2)
    assert.equal(test.name, "Typecheck + Build (Node.js ${{ matrix.node }})")
    assert.deepEqual(build.needs, ["test", "lower-bounds"])
    // A skipped job counts as passed: the job must run after a failed leg too.
    assert.equal(build.if, "${{ !cancelled() }}")
    const [check] = steps(build)
    assert.equal(check.env?.TEST_RESULT, "${{ needs.test.result }}")
    assert.equal(check.env?.LOWER_BOUNDS_RESULT, "${{ needs.lower-bounds.result }}")
    for (const [testResult, lowerBounds, status] of [
      ["success", "success", 0],
      ["failure", "success", 1],
      ["cancelled", "success", 1],
      ["skipped", "success", 1],
      ["success", "failure", 1],
      ["success", "cancelled", 1],
      ["success", "skipped", 1],
    ]) {
      const run = spawnSync("bash", ["-e", "-c", check.run], {
        encoding: "utf8",
        env: { ...isolatedEnv, TEST_RESULT: testResult, LOWER_BOUNDS_RESULT: lowerBounds },
      })
      assert.equal(run.status, status, `${testResult} ${lowerBounds}`)
    }
  })

  // A required check whose workflow never starts stays pending and blocks the merge.
  it("filters no paths at the workflow level", () => {
    for (const [event, filter] of Object.entries(ci.on)) {
      for (const key of ["paths", "paths-ignore"]) assert.equal(filter?.[key], undefined, event)
    }
  })

  // The generator's suite takes about 35 minutes; it runs in mutation-nightly.yml.
  it("runs core's mutation tests alone on every pull request, with no scope job and no build", () => {
    assert.equal(ci.jobs.changes, undefined)
    assert.equal(mutation.needs, undefined)
    assert.equal(mutation.if, "github.event_name == 'pull_request'")
    assert.deepEqual(commands(mutation), [
      "pnpm install --frozen-lockfile",
      "pnpm --fail-if-no-match --filter @miragon/mcp-toolkit-tool-codegen-core run test:mutation",
    ])
  })

  // Either would leave the required check green with every mutant alive.
  it("lets nothing skip core's mutation tests or ignore their failure", () => {
    assertFailureFailsJob(mutation)
  })

  it("uploads core's mutation report, after a failed run too", () => {
    const upload = artifactUpload(mutation)
    assert.equal(upload.if, "${{ !cancelled() }}")
    assert.equal(upload.with?.path, "packages/tool-codegen-core/reports/mutation/mutation.json")
  })
})

describe("mutation-nightly.yml", () => {
  const nightly = workflow("mutation-nightly.yml")
  const { decide, mutation } = nightly.jobs
  const decision = steps(decide).find((step) => step.id === "decide")

  /** Runs the decision against a stubbed `gh`, which knows this call and no other. */
  const runDecision = ({ event, sha = "0123abcd", lastSuccess, ghDown = false }) =>
    runStep(decision, {
      files: {},
      stubs: {
        gh:
          '[ "$*" = "run list --workflow mutation-nightly.yml --branch main --status success --limit 1 --json headSha" ] ||\n' +
          '  { echo "gh: unexpected arguments: $*" >&2; exit 2; }\n' +
          '[ -n "$STUB_GH_DOWN" ] && { echo "gh: Bad Gateway (HTTP 502)" >&2; exit 1; }\n' +
          'echo "$STUB_RUNS"\n',
      },
      env: {
        GITHUB_EVENT_NAME: event,
        GITHUB_SHA: sha,
        // gh's own answer: an empty list when no run matches.
        STUB_RUNS: JSON.stringify(lastSuccess ? [{ headSha: lastSuccess }] : []),
        STUB_GH_DOWN: ghDown ? "1" : "",
      },
    })

  // A pull request or a push would bring back the cost the workflow exists to move off them.
  it("runs on the schedule and by dispatch only, off the top of the hour", () => {
    assert.deepEqual(Object.keys(nightly.on).sort(), ["schedule", "workflow_dispatch"])
    assert.deepEqual(nightly.on.schedule, [{ cron: "17 2 * * *" }])
  })

  it("lets the GITHUB_TOKEN only read, the decision job only the runs", () => {
    assert.deepEqual(nightly.permissions, { contents: "read" })
    assert.deepEqual(decide.permissions, { actions: "read" })
    assert.equal(mutation.permissions, undefined)
  })

  // A dispatch must not throw away the 35 minutes of a night that is still running.
  it("queues a run behind a running one, never cancels it", () => {
    assert.deepEqual(nightly.concurrency, {
      group: "mutation-nightly",
      "cancel-in-progress": false,
    })
  })

  it("gives the suites 60 minutes", () => {
    assert.equal(mutation["timeout-minutes"], 60)
  })

  it("skips the suites only on the decision's explicit false", () => {
    assert.deepEqual([mutation.needs].flat(), ["decide"])
    assert.equal(mutation.if, "${{ !cancelled() && needs.decide.outputs.run != 'false' }}")
    assert.equal(decide.outputs?.run, "${{ steps.decide.outputs.run }}")
  })

  it("builds, then runs the root test:mutation script with no token left in the checkout", () => {
    assert.deepEqual(commands(mutation), [
      "pnpm install --frozen-lockfile",
      "pnpm build",
      "pnpm test:mutation",
    ])
    assert.equal(steps(mutation).find(isCheckout).with?.["persist-credentials"], false)
    const setupNode = steps(mutation).find((step) => step.uses?.startsWith("actions/setup-node@"))
    assert.equal(setupNode.with?.["node-version"], 26)
  })

  // A run that ignores a failure stays green, and the next night would skip at its commit.
  it("lets nothing skip the suites or ignore a failure, the decision's included", () => {
    assertFailureFailsJob(decide)
    assertFailureFailsJob(mutation)
  })

  it("uploads the mutation reports, after a failed run too", () => {
    const upload = artifactUpload(mutation)
    assert.equal(upload.if, "${{ !cancelled() }}")
    assert.equal(upload.with?.path, "packages/*/reports/mutation/mutation.json")
  })

  it("decides without a checkout or an install, with gh told its token and repository", () => {
    assert.ok(!steps(decide).some(isCheckout), "no checkout")
    assert.doesNotMatch(decision.run, /\b(?:pnpm|npm|yarn|npx)\b/)
    // Without a checkout gh fails on a missing GH_REPO: "failed to determine base repo".
    assert.deepEqual(decision.env, {
      GH_TOKEN: "${{ github.token }}",
      GH_REPO: "${{ github.repository }}",
    })
  })

  it("skips a scheduled night only at the commit of the last successful run", () => {
    const same = runDecision({ event: "schedule", sha: "aaa111", lastSuccess: "aaa111" })
    assert.equal(same.status, 0, same.log)
    assert.deepEqual(same.outputs, { run: "false" })
    const other = runDecision({ event: "schedule", sha: "bbb222", lastSuccess: "aaa111" })
    assert.equal(other.status, 0, other.log)
    assert.deepEqual(other.outputs, { run: "true" })
  })

  it("runs a scheduled night when no run has succeeded yet", () => {
    const first = runDecision({ event: "schedule" })
    assert.equal(first.status, 0, first.log)
    assert.deepEqual(first.outputs, { run: "true" })
  })

  it("always runs a dispatch, at the last successful commit too", () => {
    const run = runDecision({ event: "workflow_dispatch", sha: "aaa111", lastSuccess: "aaa111" })
    assert.equal(run.status, 0, run.log)
    assert.deepEqual(run.outputs, { run: "true" })
  })

  // No output at all, which the mutation job reads as "run": the night runs and stays visibly red.
  it("fails the step and prints no output when gh fails", () => {
    const run = runDecision({
      event: "schedule",
      sha: "aaa111",
      lastSuccess: "aaa111",
      ghDown: true,
    })
    assert.notEqual(run.status, 0)
    assert.deepEqual(run.outputs, {})
    assert.match(run.log, /HTTP 502/)
  })
})
