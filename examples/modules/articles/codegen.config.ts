import type { CodegenConfig } from "@miragon/mcp-toolkit-tool-codegen"

const config: CodegenConfig = {
  proxyName: "articles",
  upstreamUrl: process.env.UPSTREAM_ARTICLES_URL ?? "http://localhost:4000/mcp",
  auth: { mode: "none" },
  out: "./generated",
}

export default config
