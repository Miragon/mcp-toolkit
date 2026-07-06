import { defineConfig } from "vitepress"

export default defineConfig({
  // GitHub Pages serves the project site under /mcp-toolkit/ — the docs
  // workflow (.github/workflows/docs.yml) sets DOCS_BASE accordingly.
  // Local dev and preview keep the default "/".
  base: process.env.DOCS_BASE ?? "/",
  lang: "en-US",
  title: "mcp-toolkit",
  description:
    "Shared framework runtime and UI primitives for mcp-use based MCP servers. Plugins, pipeline steps, widgets, and an interactive view builder.",
  cleanUrls: true,
  lastUpdated: true,

  // Relative links inside the docs work fine.
  // Links from docs into ../examples/..., ../../packages/..., ../../templates/...,
  // or ../../.claude/... point at repo-local source files that aren't part of the
  // VitePress routing tree (they exist on disk but the site doesn't render them).
  // Tell VitePress to leave them alone — they resolve correctly when the docs are
  // read on GitHub or via the file system.
  ignoreDeadLinks: [
    /(?:^|\/)examples\//,
    /(?:^|\/)packages\//,
    /(?:^|\/)templates\//,
    /(?:^|\/)\.claude\//,
  ],

  themeConfig: {
    siteTitle: "mcp-toolkit",
    nav: [
      { text: "Getting Started", link: "/getting-started" },
      { text: "Concepts", link: "/concepts/architecture" },
      { text: "Guides", link: "/guides/building-a-ui-only-module" },
      { text: "Reference", link: "/reference/components" },
      { text: "Recipes", link: "/recipes/adding-an-oauth2-upstream" },
    ],

    sidebar: [
      {
        text: "Getting Started",
        items: [{ text: "Getting started", link: "/getting-started" }],
      },
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
          { text: "Upstream proxies", link: "/concepts/upstream-proxies" },
          { text: "Middleware", link: "/concepts/middleware" },
        ],
      },
      {
        text: "Guides",
        collapsed: false,
        items: [
          { text: "Building a full module", link: "/guides/building-a-full-module" },
          { text: "Building a UI-only module", link: "/guides/building-a-ui-only-module" },
          {
            text: "Developing widgets in isolation",
            link: "/guides/developing-widgets-in-isolation",
          },
          { text: "Building dashboards", link: "/guides/building-dashboards" },
          { text: "White-labeling", link: "/guides/white-labeling" },
          { text: "Layout & rendering", link: "/guides/layout-and-rendering" },
          { text: "Using tool-codegen", link: "/guides/using-tool-codegen" },
          { text: "Typed callTool in steps", link: "/guides/typed-call-tool-in-steps" },
          { text: "Registering upstream proxies", link: "/guides/registering-upstream-proxies" },
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
          {
            text: "@miragon/mcp-toolkit-proxy-contract",
            link: "/reference/api-proxy-contract",
          },
          {
            text: "@miragon/mcp-toolkit-tool-codegen",
            link: "/reference/api-tool-codegen",
          },
          { text: "Environment variables", link: "/reference/env-vars" },
        ],
      },
      {
        text: "Recipes",
        collapsed: true,
        items: [
          {
            text: "Adding an OAuth2 upstream",
            link: "/recipes/adding-an-oauth2-upstream",
          },
          { text: "Role-based module access", link: "/recipes/role-based-module-access" },
          { text: "Multi-proxy setup", link: "/recipes/multi-proxy-setup" },
          { text: "Debugging pipeline steps", link: "/recipes/debugging-pipeline-steps" },
        ],
      },
      {
        text: "Plans",
        collapsed: true,
        items: [
          {
            text: "Upstream-hosted modules",
            link: "/plans/upstream-hosted-modules",
          },
        ],
      },
    ],

    socialLinks: [{ icon: "github", link: "https://github.com/Miragon/mcp-toolkit" }],

    outline: { level: [2, 3] },

    search: { provider: "local" },

    editLink: {
      pattern: "https://github.com/Miragon/mcp-toolkit/edit/main/docs/:path",
      text: "Edit this page on GitHub",
    },

    footer: {
      message: "Released under the MIT License.",
      copyright: "Copyright © Miragon",
    },
  },
})
