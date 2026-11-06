// Read by `mcp-tool-codegen generate` (Node.js strips the types itself, so only erasable
// TypeScript here: type imports and annotations, no enums or namespaces).
import type { CodegenConfig } from "@miragon/mcp-toolkit-tool-codegen"

const config: CodegenConfig = {
  name: "tasks",
  url: process.env.TASKS_MCP_URL ?? "http://localhost:4000/mcp",
  out: "./src/generated",
  react: true,
}

export default config
