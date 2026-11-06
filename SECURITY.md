# Security policy

## Report a vulnerability

Report it privately through GitHub: on the repository's **Security** tab, choose **Report a
vulnerability** ([open a report](https://github.com/Miragon/mcp-toolkit/security/advisories/new)).
Never report one in a public issue or pull request. Name the package and version, what an attacker
controls and what it leads to; a minimal `tools/list` or config that shows it helps most.

## Supported versions

Fixes go into the latest 3.x release of `@miragon/mcp-toolkit-tool-codegen`,
`@miragon/mcp-toolkit-tool-codegen-core` and `@miragon/mcp-toolkit-tool-codegen-react`. 2.x gets
none, `@miragon/mcp-toolkit-core` and `@miragon/mcp-toolkit-ui` included.

## Scope

The generator treats everything in an MCP server's `tools/list` as untrusted input;
[Guarantees and limits](https://miragon.github.io/mcp-toolkit/guarantees) says what that covers. In
scope are a tool list that gets code, a comment directive or a declaration of its own choosing into
the generated files, or that makes `generate` read a local file, call another host or run without
bound, and a secret from your config (a token, a header value) that reaches the generated files, the
CLI's output or an error. Out of scope are the limits that page lists under
[What the generator does not do](https://miragon.github.io/mcp-toolkit/guarantees#what-the-generator-does-not-do)
and your own config: `overrides.<tool>.input` and `output` are TypeScript you write.
