import { execFile } from "node:child_process"
import fs from "node:fs/promises"
import path from "node:path"
import { promisify } from "node:util"

/**
 * Support for the gate self-tests in `fitness-gates.test.ts`: write a probe
 * file at its REAL location (virtual paths don't work — eslint's project
 * service and dependency-cruiser resolve from disk), run the gate CLI against
 * it, and always clean up. Probe filenames carry the `__fitness-probe__`
 * prefix, which is git-ignored.
 */

const execFileAsync = promisify(execFile)

export const REPO_ROOT = path.resolve(import.meta.dirname, "..", "..", "..")

export async function withProbeFiles<T>(
  files: Record<string, string>,
  fn: () => Promise<T>,
): Promise<T> {
  const paths = Object.keys(files).map((p) => path.resolve(REPO_ROOT, p))
  try {
    for (const [rel, contents] of Object.entries(files)) {
      const abs = path.resolve(REPO_ROOT, rel)
      await fs.mkdir(path.dirname(abs), { recursive: true })
      await fs.writeFile(abs, contents, "utf8")
    }
    return await fn()
  } finally {
    for (const abs of paths) {
      await fs.rm(abs, { force: true, recursive: true })
    }
  }
}

/** Run a repo binary (node_modules/.bin) from the repo root; never throws on exit != 0. */
export async function runBin(
  bin: string,
  args: string[],
): Promise<{ code: number; stdout: string; stderr: string }> {
  try {
    const { stdout, stderr } = await execFileAsync(
      path.join(REPO_ROOT, "node_modules", ".bin", bin),
      args,
      {
        cwd: REPO_ROOT,
        maxBuffer: 64 * 1024 * 1024,
      },
    )
    return { code: 0, stdout, stderr }
  } catch (error) {
    const e = error as { code?: number; stdout?: string; stderr?: string }
    return { code: e.code ?? 1, stdout: e.stdout ?? "", stderr: e.stderr ?? "" }
  }
}

/** ESLint a set of files with the repo config; returns ruleId+message pairs. */
export async function eslintProbe(
  relPaths: string[],
): Promise<{ code: number; messages: { ruleId: string | null; message: string }[] }> {
  const { code, stdout } = await runBin("eslint", ["--format", "json", ...relPaths])
  const results = JSON.parse(stdout) as { messages: { ruleId: string | null; message: string }[] }[]
  return { code, messages: results.flatMap((r) => r.messages) }
}

/** dependency-cruiser over the given paths; returns violated rule names. */
export async function depcruiseProbe(
  config: string,
  relPaths: string[],
): Promise<{ code: number; rules: string[] }> {
  const { code, stdout } = await runBin("depcruise", [
    "--config",
    config,
    "--output-type",
    "json",
    ...relPaths,
  ])
  const parsed = JSON.parse(stdout) as {
    summary: { violations: { rule: { name: string } }[] }
  }
  return { code, rules: parsed.summary.violations.map((v) => v.rule.name) }
}
