import { chmod } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"

const here = path.dirname(fileURLToPath(import.meta.url))
const cli = path.resolve(here, "..", "dist", "cli.js")
await chmod(cli, 0o755)
