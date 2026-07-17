---
layout: home

hero:
  name: mcp-toolkit
  text: Build MCP servers with widgets, steps, and a view builder.
  tagline: Shared framework runtime and UI primitives for mcp-use based MCP servers.
  actions:
    - theme: brand
      text: Get started
      link: /getting-started
    - theme: alt
      text: Try the playground
      link: /playground/
    - theme: alt
      text: Architecture
      link: /concepts/architecture
    - theme: alt
      text: View on GitHub
      link: https://github.com/Miragon/mcp-toolkit

features:
  - title: Plugin contract
    details: Bundle steps, widgets, and tools into one AppPlugin. The framework wires registries and view rendering for you.
    link: /concepts/app-plugins
    linkText: Learn about plugins
  - title: Pipelines & steps
    details: Resolve data declaratively. Steps publish keys, downstream steps and widgets consume them. Typed callTool injection per plugin.
    link: /concepts/pipelines-and-steps
    linkText: Read the contract
  - title: Widgets & view builder
    details: Render structured data with shadcn-styled React primitives. Users can flip into build mode and persist dashboards — without round-tripping through the LLM.
    link: /concepts/view-builder
    linkText: Explore the builder
  - title: Self-contained servers
    details: Each toolkit server owns its tools, steps, widgets, and UI bundle. Aggregating several servers into one surface is an external MCP gateway's job.
    link: /concepts/architecture
    linkText: See the architecture
  - title: Middleware
    details: Org-gate and role-filter middleware ship as composable helpers. Wire unconditionally — both pass through when their config is empty.
    link: /concepts/middleware
    linkText: Lock down access
  - title: Type-safe tooling
    details: tool-codegen turns an MCP server's tools/list into typed TS + React Query hooks. Catch tool-name typos and schema drift at build time.
    link: /reference/api-tool-codegen
    linkText: Generate types
---
