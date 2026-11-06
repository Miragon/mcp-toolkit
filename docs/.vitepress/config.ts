// The docs site, built with the Miragon docs kit (docs/.vitepress/miragon/, vendored unchanged
// from Miragon/corporate-identity, skill docs-site). The kit sets everything else: base from
// DOCS_BASE (/mcp-toolkit/ in .github/workflows/docs.yml), theme, colours light and dark, GitHub
// anchors, Mermaid, search, the legal row.
import { miragonDocs } from "./miragon/config"

export default miragonDocs({
  repo: "Miragon/mcp-toolkit",
  title: "Miragon MCP Toolkit",
  description: "A collection of TypeScript libraries that support building MCP servers.",
  // No productPage: the toolkit has no page on miragon.ai. The star count stays off while the
  // repo has hardly any stars.
  githubStars: false,
  // MIT, the owner's decision; the LICENSE file and the packages' license fields come with the
  // license pull request, which merges before this site goes live.
  footerMessage: "Released under the MIT License.",
  // VitePress appends each page's path without the base, so the hostname carries /mcp-toolkit/.
  sitemap: { hostname: "https://miragon.github.io/mcp-toolkit/" },
  socialLinks: [
    {
      icon: "npm",
      link: "https://www.npmjs.com/package/@miragon/mcp-toolkit-tool-codegen",
      ariaLabel: "npm",
    },
  ],

  nav: [
    { text: "Getting started", link: "/getting-started" },
    { text: "Guides", link: "/guides/generate", activeMatch: "^/guides/" },
    { text: "Reference", link: "/reference/configuration", activeMatch: "^/reference/" },
    { text: "Migrating from 2.x", link: "/migrating-from-2x" },
  ],

  sidebar: [
    {
      text: "Start",
      items: [{ text: "Getting started", link: "/getting-started" }],
    },
    {
      text: "Generate",
      items: [
        { text: "Generate typed tools", link: "/guides/generate" },
        { text: "Keep generated code in sync", link: "/guides/check-in-ci" },
      ],
    },
    {
      text: "Call tools",
      items: [
        { text: "Call tools from Node and the browser", link: "/guides/call-tools" },
        { text: "Use the React hooks", link: "/guides/react-hooks" },
      ],
    },
    {
      text: "Reference",
      items: [
        { text: "Configuration", link: "/reference/configuration" },
        { text: "CLI", link: "/reference/cli" },
        { text: "Generated code", link: "/reference/generated-code" },
        { text: "Core API", link: "/reference/core" },
        { text: "React API", link: "/reference/react" },
      ],
    },
    {
      text: "Background",
      items: [
        { text: "Guarantees and limits", link: "/guarantees" },
        { text: "Migrating from 3.x", link: "/migrating-from-3x" },
        { text: "Migrating from 2.x", link: "/migrating-from-2x" },
      ],
    },
  ],
})
