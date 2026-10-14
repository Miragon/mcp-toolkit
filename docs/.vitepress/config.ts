// The docs site, built with the Miragon docs kit (docs/.vitepress/miragon/, vendored from
// Miragon/corporate-identity, skill docs-site). The kit sets everything else: base from
// DOCS_BASE, theme, colours light and dark, GitHub anchors, Mermaid, search, the legal row.
import { miragonDocs } from "./miragon/config"

export default miragonDocs({
  repo: "Miragon/mcp-toolkit",
  // The product name (corporate design: a tool is "Miragon" plus what it does); the npm
  // packages keep their @miragon/mcp-toolkit-* names.
  title: "Miragon MCP Toolkit",
  siteTitle: "MCP Toolkit",
  description:
    "Shared framework runtime and UI primitives for mcp-use based MCP servers. Plugins, pipeline steps, widgets, and an interactive view builder.",

  // Links from the docs into ../examples/, ../../packages/, ../../templates/, ../../deploy/
  // or ../../.claude/ point at source files outside the VitePress tree. They resolve on
  // GitHub and in the file system, so VitePress leaves them alone.
  ignoreDeadLinks: [
    /(?:^|\/)examples\//,
    /(?:^|\/)packages\//,
    /(?:^|\/)templates\//,
    /(?:^|\/)deploy\//,
    /(?:^|\/)\.claude\//,
  ],

  // Getting Started and Playground are top-level sections; everything reference-like lives
  // under the "Docs" menu. Each of the three has its own sidebar, so they never mix.
  nav: [
    { text: "Getting Started", link: "/getting-started", activeMatch: "^/getting-started" },
    { text: "Playground", link: "/playground/", activeMatch: "^/playground/" },
    {
      text: "Docs",
      activeMatch: "^/(concepts|guides|reference|recipes)/",
      items: [
        { text: "Concepts", link: "/concepts/architecture" },
        { text: "Guides", link: "/guides/building-dashboards" },
        { text: "Reference", link: "/reference/components" },
        { text: "Recipes", link: "/recipes/debugging-pipeline-steps" },
      ],
    },
  ],

  // Path-based sidebars: one self-contained area per section. The "/" entry is the Docs
  // sidebar and the fallback for every docs page.
  sidebar: {
    "/getting-started": [
      {
        text: "Getting Started",
        items: [
          { text: "Getting started", link: "/getting-started" },
          { text: "Try the playground", link: "/playground/" },
        ],
      },
    ],

    "/playground/": [
      {
        text: "Playground",
        items: [
          { text: "Overview", link: "/playground/" },
          { text: "Guided tour", link: "/playground/tour" },
        ],
      },
    ],

    "/": [
      {
        text: "Concepts",
        collapsed: false,
        items: [
          { text: "Architecture", link: "/concepts/architecture" },
          { text: "Layered adoption", link: "/concepts/layered-adoption" },
          { text: "App plugins", link: "/concepts/app-plugins" },
          { text: "Pipelines & steps", link: "/concepts/pipelines-and-steps" },
          { text: "Widgets", link: "/concepts/widgets" },
          { text: "Host portability", link: "/concepts/host-portability" },
          { text: "View builder", link: "/concepts/view-builder" },
          { text: "Middleware", link: "/concepts/middleware" },
        ],
      },
      {
        text: "Guides",
        collapsed: false,
        items: [
          { text: "Migrating to mcp-use 2.x", link: "/guides/migrating-to-mcp-use-2" },
          {
            text: "Developing widgets in isolation",
            link: "/guides/developing-widgets-in-isolation",
          },
          { text: "Building dashboards", link: "/guides/building-dashboards" },
          { text: "White-labeling", link: "/guides/white-labeling" },
          { text: "Layout & rendering", link: "/guides/layout-and-rendering" },
          { text: "Using tool-codegen", link: "/guides/using-tool-codegen" },
          { text: "Typed callTool in steps", link: "/guides/typed-call-tool-in-steps" },
          { text: "Middleware & auth", link: "/guides/middleware-and-auth" },
          { text: "Testing with examples", link: "/guides/testing-with-examples" },
        ],
      },
      {
        text: "Reference",
        collapsed: false,
        items: [
          { text: "Component reference", link: "/reference/components" },
          { text: "@miragon/mcp-toolkit-core", link: "/reference/api-core" },
          { text: "@miragon/mcp-toolkit-ui", link: "/reference/api-ui" },
          { text: "@miragon/mcp-toolkit-tool-codegen", link: "/reference/api-tool-codegen" },
          { text: "Environment variables", link: "/reference/env-vars" },
        ],
      },
      {
        text: "Recipes",
        collapsed: true,
        items: [{ text: "Debugging pipeline steps", link: "/recipes/debugging-pipeline-steps" }],
      },
    ],
  },
})
