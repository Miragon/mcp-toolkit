import { defineConfig } from "vitepress"

// GitHub Pages serves the project site under /mcp-toolkit/ — the docs
// workflow (.github/workflows/docs.yml) sets DOCS_BASE accordingly.
// Local dev and preview keep the default "/".
const base = process.env.DOCS_BASE ?? "/"

export default defineConfig({
  base,
  lang: "en-US",
  // The product name (corporate design: a tool is "Miragon" plus what it
  // does); the npm packages keep their @miragon/mcp-toolkit-* names.
  title: "Miragon MCP Toolkit",
  description:
    "Shared framework runtime and UI primitives for mcp-use based MCP servers. Plugins, pipeline steps, widgets, and an interactive view builder.",
  cleanUrls: true,
  lastUpdated: true,

  // Code blocks sit on --cd-grau (light) and a white lift of --cd-schwarz
  // (dark). There, github-light-high-contrast and github-dark-default keep
  // every token colour at WCAG AA (the lowest, comments, at 4.72:1 and
  // 4.98:1); VitePress' default pair github-light/github-dark and
  // github-light-default (comments 4.26:1 on --cd-grau) don't.
  markdown: {
    theme: { light: "github-light-high-contrast", dark: "github-dark-default" },
  },

  head: [
    // The app icon of Miragon software: the green Komet on the blue tile,
    // the CI's file unchanged. Head links are not rewritten for `base`.
    ["link", { rel: "icon", type: "image/svg+xml", href: `${base}logo/miragon-komet-blau.svg` }],
    // CI primary blue (--cd-blau) for the browser chrome
    ["meta", { name: "theme-color", content: "#335DE5" }],
  ],

  // Preload the self-hosted Geist (hashed file name, so a static head link
  // can't point at it; see vitepress.dev site-config#transformhead).
  transformHead({ assets }) {
    const geist = assets.find((file) => /geist-latin-wght-normal\.[\w-]+\.woff2$/.test(file))
    if (!geist) return
    return [
      ["link", { rel: "preload", href: geist, as: "font", type: "font/woff2", crossorigin: "" }],
    ]
  },

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
    /(?:^|\/)deploy\//,
    /(?:^|\/)\.claude\//,
  ],

  themeConfig: {
    // The official wordmarks: green (the standard) on light, white on dark.
    logo: {
      light: "/logo/miragon-logo-gruen.svg",
      dark: "/logo/miragon-logo-weiss.svg",
      alt: "Miragon",
    },
    // A product shows the wordmark and writes its name next to it in Geist;
    // the wordmark already reads MIRAGON, so the nav reads "MIRAGON MCP
    // Toolkit" (and its link's accessible name "Miragon MCP Toolkit").
    siteTitle: "MCP Toolkit",
    // Getting Started and Playground are foregrounded as their own top-level
    // sections; everything reference-y lives under the "Docs" submenu. Each of
    // the three has its own left sidebar (see `sidebar` below) so they never
    // mix.
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

    // Path-based sidebars: one self-contained left area per section. The "/"
    // entry is the Docs sidebar and acts as the fallback for every docs page.
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
            {
              text: "Migrating to mcp-use 2.x",
              link: "/guides/migrating-to-mcp-use-2",
            },
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
          items: [{ text: "Debugging pipeline steps", link: "/recipes/debugging-pipeline-steps" }],
        },
      ],
    },

    socialLinks: [{ icon: "github", link: "https://github.com/Miragon/mcp-toolkit" }],

    outline: { level: [2, 3] },

    search: { provider: "local" },

    editLink: {
      pattern: "https://github.com/Miragon/mcp-toolkit/edit/main/docs/:path",
      text: "Edit this page on GitHub",
    },

    // A plain date in the site's language ("Oct 11, 2026"), not the reader's
    // short date and time ("10/11/26, 10:44 AM").
    lastUpdated: {
      text: "Last updated",
      formatOptions: { dateStyle: "medium", forceLocale: true },
    },

    // Say what happened and what to do, in sentence case (VitePress' default
    // is an all-caps "PAGE NOT FOUND" and a quote).
    notFound: {
      title: "This page doesn't exist",
      quote: "The link may be outdated. Search the docs, or start at the docs home.",
      linkLabel: "Go to the docs home",
      linkText: "Go to the docs home",
    },

    footer: {
      message: "Released under the MIT License.",
      copyright: "Copyright © Miragon",
    },
  },
})
