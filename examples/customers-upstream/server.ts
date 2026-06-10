import fs from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { MCPServer } from "mcp-use/server"
import { GET_MODULE_MANIFEST_TOOL, type ModuleManifest } from "@miragon/mcp-toolkit-proxy-contract"
import { z } from "zod"

/**
 * Fake "customers" external MCP — exercises the *fully upstream-hosted* path.
 *
 * Ships everything the host needs for this module:
 *   - get-customer         tool the declarative step calls
 *   - get-module-manifest  advertises the step + widget so the host compiles
 *                          them into its registries at boot (no host-side code)
 *   - ui://customers/customer-card.js   the widget bundle, served as an MCP
 *                          resource and fetched on demand via `read-widget-bundle`
 */

const here = path.dirname(fileURLToPath(import.meta.url))
const bundlePath = path.join(here, "widget", "dist", "customer-card.js")
const bundleUri = "ui://customers/customer-card.js"

let bundleSource: string
try {
  bundleSource = await fs.readFile(bundlePath, "utf-8")
} catch (err) {
  const message = err instanceof Error ? err.message : String(err)
  process.stderr.write(
    `[customers-upstream] widget bundle missing at ${bundlePath}: ${message}\n` +
      `Run \`pnpm --filter @miragon/mcp-toolkit-examples build:customer-widget\` first.\n`,
  )
  process.exit(1)
}

const server = new MCPServer({
  name: "customers-upstream",
  version: "0.0.1",
  host: "0.0.0.0",
})

const customers = [
  {
    id: "c1",
    name: "Acme Corp",
    email: "contact@acme.example",
    tier: "gold" as const,
    since: "2024-05-01",
  },
  {
    id: "c2",
    name: "Globex Industries",
    email: "hello@globex.example",
    tier: "silver" as const,
    since: "2025-02-14",
  },
  {
    id: "c3",
    name: "Initech",
    email: "support@initech.example",
    tier: "bronze" as const,
    since: "2025-11-03",
  },
]

const customerSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string(),
  tier: z.enum(["gold", "silver", "bronze"]),
  since: z.string(),
})

server.tool(
  {
    name: "get-customer",
    description: "Fetch a single customer by id. Called by the declarative step.",
    schema: z.object({
      id: z.string().describe("Customer id."),
    }),
    annotations: { readOnlyHint: true },
    outputSchema: customerSchema,
  },
  // eslint-disable-next-line @typescript-eslint/require-await
  async ({ id }) => {
    const customer = customers.find((c) => c.id === id)
    if (!customer) throw new Error(`unknown customer: ${id}`)
    return {
      content: [{ type: "text" as const, text: JSON.stringify(customer) }],
      structuredContent: customer,
    }
  },
)

const manifest: ModuleManifest = {
  schemaVersion: 1,
  moduleId: "customers",
  runtime: { react: "^19.0.0" },
  steps: [
    {
      id: "customers:resolve-customer",
      dataType: "customers:customer",
      requires: ["customers:customerId"],
      produces: ["customers:customer"],
      tool: "get-customer",
      inputMapping: { id: "keys.customers:customerId" },
      outputMapping: { "customers:customer": "structuredContent" },
    },
  ],
  widgets: [
    {
      id: "customers:customer-card",
      requires: ["customers:customer"],
      bundle: bundleUri,
      size: "half",
    },
  ],
}

server.tool(
  {
    name: GET_MODULE_MANIFEST_TOOL,
    description:
      "Returns the upstream-hosted module manifest this server contributes to a toolkit host.",
    schema: z.object({}),
    annotations: { readOnlyHint: true },
  },
  // eslint-disable-next-line @typescript-eslint/require-await
  async () => ({
    content: [{ type: "text" as const, text: JSON.stringify(manifest) }],
    structuredContent: manifest,
  }),
)

server.resource(
  {
    name: "customers-customer-card-bundle",
    uri: bundleUri,
    mimeType: "text/javascript",
  },
  // eslint-disable-next-line @typescript-eslint/require-await
  async () => ({
    contents: [{ uri: bundleUri, mimeType: "text/javascript", text: bundleSource }],
  }),
)

const port = Number(process.env.UPSTREAM_CUSTOMERS_PORT ?? 4001)
await server.listen(port)
process.stdout.write(`[customers-upstream] listening on http://localhost:${port}/mcp\n`)
