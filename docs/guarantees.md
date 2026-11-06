# Guarantees and limits

The generator treats everything in `tools/list` as untrusted input; this page says what it escapes,
what it rejects, what it does not do and where the runtime packages stop.

## Why the tool list is untrusted

`mcp-tool-codegen generate` turns a server's answer into TypeScript that you commit and compile into
your app. Whoever controls that answer writes part of your source code: your own server, a hosted
one run by someone else, or one that was compromised. 2.x copied tool names into the generated code
unescaped, so a malicious server could inject code
([Miragon/mcp-toolkit#177](https://github.com/Miragon/mcp-toolkit/issues/177)).

3.0 treats every field of a tool as the server's word: `name`, `description`, `inputSchema`,
`outputSchema` and `annotations` (`title` and every annotation but `readOnlyHint` are not used).
Each field reaches the generated files only through one of the paths below, and each path escapes
the text, drops it or fails the run with a message that names the tool. Your own config is trusted:
`overrides.<tool>.input` and `output` are TypeScript you write, and the generator inserts them as
written.

| The server sends                                                             | The generator                                                                                    |
| ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| a tool name with quotes, line breaks or code                                 | builds identifiers only from its `[A-Za-z0-9]` runs and writes the name only as a string literal |
| invisible characters in a name (bidirectional overrides, zero-width spaces)  | writes them as `\u` escapes                                                                      |
| invisible characters in a description                                        | drops them                                                                                       |
| `*/` in a description                                                        | writes `*\/`, so the comment stays closed                                                        |
| the description `@ts-ignore`                                                 | writes it as a comment of several lines, never one TypeScript reads as a directive               |
| two tools that map to one identifier (`list-tasks` and `list_tasks`)         | fails and names both tools and the fix                                                           |
| a tool named `then`, `toJSON`, `constructor`, `call` and similar             | fails: the client's own `call` or a member JavaScript looks up on every object has that name     |
| a name without an ASCII letter or digit, a name twice, a tool without a name | fails                                                                                            |
| `tsType`, `tsEnumNames`, `title`, `$id`, `minItems` or an unknown keyword    | drops it                                                                                         |
| a `$ref` to a file, a URL or a relative path                                 | types it `unknown` and fetches nothing                                                           |
| a chain of local `$ref`s or a recursive type                                 | declares each target once, named with the tool's prefix                                          |
| a URL that carries an API key in its path or query                           | writes only the origin into the `// Source:` header and its messages                             |
| an error body with escape sequences or a line such as `::error`              | prints control characters as spaces and marks every line after the first                         |

## What a hostile tool list turns into

A test server listed this tool next to a second one, `purge`, whose whole description is
`@ts-ignore`:

```json
{
  "name": "search\u200btasks\"); process.exit(1); (\"",
  "description": "Finds tasks. */ export const pwned = true /*",
  "inputSchema": {
    "type": "object",
    "title": "Pwned",
    "properties": {
      "query": { "type": "string", "tsType": "any; } export const pwned = true; interface X {" },
      "filter": { "$ref": "https://evil.example/filter.json" },
      "secret": { "$ref": "file:///etc/passwd" }
    },
    "required": ["query"]
  },
  "outputSchema": {
    "type": "object",
    "properties": { "root": { "$ref": "#/$defs/Node" } },
    "$defs": {
      "Node": {
        "type": "object",
        "properties": { "children": { "type": "array", "items": { "$ref": "#/$defs/Node" } } }
      }
    }
  },
  "annotations": { "readOnlyHint": true }
}
```

The config named it `shop` and gave a URL with a key in its query,
`url: "http://localhost:4000/mcp?api_key=sk-live-1234"`. `pnpm exec mcp-tool-codegen generate` wrote
this `tools.ts` (abridged: a line `...` stands for lines left out on this page):

```ts
// AUTO-GENERATED by @miragon/mcp-toolkit-tool-codegen. Do not edit by hand.
// Regenerate with: mcp-tool-codegen generate
// Source: http://localhost:4000
...
export interface ShopSearchTasksProcessExit1Input {
  query: string
  filter?: unknown
  secret?: unknown
}

export interface ShopSearchTasksProcessExit1Output {
  root?: ShopSearchTasksProcessExit1OutputNode
}
export interface ShopSearchTasksProcessExit1OutputNode {
  children?: ShopSearchTasksProcessExit1OutputNode[]
}

export interface ShopToolMap {
  ...
  "search\u200btasks\"); process.exit(1); (\"": {
    input: ShopSearchTasksProcessExit1Input
    output: ShopSearchTasksProcessExit1Output
  }
}
...
  return {
    call,
    /**
     * @ts-ignore
     */
    purge: (args: ShopPurgeInput = {}, options?: ToolCallOptions) => call("purge", args, options),
    /** Finds tasks. *\/ export const pwned = true /* */
    searchTasksProcessExit1: (args: ShopSearchTasksProcessExit1Input, options?: ToolCallOptions) =>
      call("search\u200btasks\"); process.exit(1); (\"", args, options),
  }
...
```

The `// Source:` line names the origin and leaves out the path and the key. The tool name became the
identifiers `ShopSearchTasksProcessExit1Input` and `searchTasksProcessExit1` from its letter and
digit runs, and appears as itself only inside string literals, the zero-width space as `\u200b`.
`tsType` and `title` are gone: `query` is a `string`, and no type is called `Pwned`. Both foreign
`$ref`s became `unknown`, and nothing was fetched. The recursive `Node` is declared once, under the
tool's prefix. Neither description can close its comment or act as a directive, and the file
compiles.

## Identifiers

An identifier in the generated code is built only from the `[A-Za-z0-9]` runs of a tool name, or of
its `overrides.<tool>.identifier`: each run capitalised and joined (`get_v2beta` gives `GetV2Beta`,
a letter after a digit upper-cased as json-schema-to-typescript does), a client method in camelCase
with a `_` before a leading digit. Everywhere else the name appears as a JSON string literal, or as
a property key that stays bare only when it is a plain ASCII identifier.

Every name a generated file declares is claimed by what produces it, and a second claim fails the
run with both owners and the fix. In `tools.ts` the core imports (`createTypedCallTool`,
`ToolCallOptions`, `ToolCaller`, `TypedCallTool`) and the five names the config's `name` produces
(`<Name>ToolMap`, `<Name>ToolName`, `<Name>CallTool`, `create<Name>Client`, `<Name>Client`) are
taken. On the client, `call` is taken, and so is every member JavaScript looks up on any object:
`then` would make the client a thenable that `await` calls, `toJSON`, `toString` and `valueOf` run
on serialisation and string conversion, and `constructor`, `hasOwnProperty`, `isPrototypeOf`,
`propertyIsEnumerable` and `toLocaleString` would shadow what code calls on objects. In `hooks.tsx`
the React imports and `<name>QueryKey` are taken.

A server that lists a tool named `then` fails the run:

```sh
pnpm exec mcp-tool-codegen generate
```

```txt
mcp-tool-codegen: cannot generate the client of tools.ts: JavaScript's object member then and the tool "then" both produce the identifier "then". Rename the tool on the server, or give it another identifier with overrides.<tool>.identifier.
```

The run also fails for a name without an ASCII letter or digit, a tool the server lists twice, a
tool without a name and an override for a tool the server does not list. The types
json-schema-to-typescript declares from a schema all start with the tool's type name; a declaration
without that prefix fails the run, so a schema can neither shadow a global the files use nor another
tool's type.

## Strings and invisible characters

Tool names and other server text appear in code only as JSON string literals, and every invisible
character in them is written as a `\u` escape: controls (C0, DEL, C1), format characters
(bidirectional overrides, zero-width characters, Unicode tags), every other default-ignorable code
point (Hangul fillers, variation selectors, the soft hyphen), line and paragraph separators and lone
surrogates. Such characters can reorder or hide code in an editor ("Trojan Source", CVE-2021-42574);
as escapes they keep the value and become visible. A property key stays quoted unless it is a plain
ASCII identifier, so no Unicode, such as an invisible filler or a homoglyph, reaches an identifier
position. The compiled types pass the same escaping.

## Schemas

json-schema-to-typescript copies parts of a schema into the code as raw text and resolves `$ref`s by
reading files and URLs. The generator therefore rebuilds each schema from the keywords that shape a
TypeScript type, each checked for its JSON Schema shape, before json-schema-to-typescript sees it:

| Kept keyword                                              | Kept when                                                    |
| --------------------------------------------------------- | ------------------------------------------------------------ |
| `type`                                                    | it names JSON Schema types (`string`, `object`, ...)         |
| `enum`, `const`                                           | the values are JSON primitives                               |
| `required`                                                | it is a list of strings, or draft 3's `true`                 |
| `$ref`                                                    | it is local: `#` or `#/…`                                    |
| `description`                                             | always, made safe for a comment                              |
| `deprecated`, `nullable`                                  | it is a boolean                                              |
| `properties`, `patternProperties`, `$defs`, `definitions` | it is a map of schemas, each rebuilt the same way            |
| `items`, `additionalItems`, `additionalProperties`        | it is a schema or a boolean (`items` also a list of schemas) |
| `allOf`, `anyOf`, `oneOf`                                 | it is a list of schemas                                      |

Every other keyword is dropped, notably `tsType` and `tsEnumNames` (json-schema-to-typescript emits
their value as raw TypeScript), `title`, `$id` and `id` (they would name declarations after server
text, and `$id` moves the base of `$ref` resolution), and `minItems` and `maxItems` (a value that is
not a number lands raw in a JSDoc tag, and a huge `minItems` expands into a huge tuple). A schema
that is not an object becomes `{}`.

## `$ref` handling

Only local references resolve, `#` and `#/…`, and only to a schema position of the same schema: a
path through `properties`, `patternProperties`, `$defs`, `definitions`, `items`,
`additionalProperties`, `additionalItems`, `allOf`, `anyOf` and `oneOf`, own keys only. A pointer
into a `required` list or a name map, a prototype member, a boolean schema and a cycle of bare
`$ref`s become `unknown`. So does every other `$ref` (`file:`, `http:`, a relative path): the
generator never reads a file or calls a URL for one. json-schema-to-typescript also runs with
external resolution off, so a reference that slipped through would fail the run instead of being
fetched.

Every reference target but the root (`#`) moves into the root `$defs` and is declared once, as a
type named with the tool's type name and the target's path. A chain of references therefore cannot
double the output per level, and a schema cannot declare a name of its own choosing.

## Comments

Descriptions go into JSDoc comments: line breaks unified, tabs as spaces, invisible characters
dropped, and every `*/` written as `*\/`, so nothing can close the comment. A description of one
line that starts with `@` is written as a comment of several lines: TypeScript reads the last line
of a block comment as a directive, so `/** @ts-ignore */` would act on the generated line below it.
The keys of `patternProperties`, which also end up in comments, get the same treatment.

## The Source header and the CLI's messages

The `// Source:` line of each generated file holds only the server URL's origin: no credentials,
query, fragment or path, where hosted MCP servers often carry an API key. The files are meant to be
committed. `generate --check` ignores the line, so the check passes against the same tools at
another address.

The CLI names a server by its origin in its messages too, and cuts every URL in an SDK error down to
its origin. With the config above and the server stopped:

```sh
pnpm exec mcp-tool-codegen generate
```

```txt
mcp-tool-codegen: cannot list the tools of http://localhost:4000: fetch failed (ECONNREFUSED): is the server running at that address?
```

The config check never echoes a URL or a header value. A URL with a user name or password is refused
(`"url" must not carry credentials: put them into "auth"`), and a header or auth value with a line
break, a control character or a character beyond Latin-1 fails with a message that names the header,
never the value.

Server text that reaches the terminal, in an error, the `inspect` table or the line diff of
`generate --check`, has every invisible character but the line break replaced by a space. An error
message is cut at 2,000 characters, and every line after its first starts with two spaces, a `|` and
a space. A server's error body can therefore neither send terminal escape sequences nor start a line
of a CI log, such as a GitHub Actions `::error` command.

## What the generator does not do

**It does not validate at run time.** The output type is the server's claim, decoded by the core
package's parse rules and never checked. What a type cannot express is the server's job: `add-task`
with an empty title passes the compiler, the server's input validation rejects it, and the call
rejects with a `ToolCallError` whose message is the server's text, here
`Input validation error: Invalid arguments for tool add-task: title: Too small: expected string to have >=1 characters`.

**It does not notice a server that changed.** The generated types describe the tool list at the
moment you ran `generate`. A renamed tool or a changed schema shows up only when you generate again,
which is why the drift check belongs in CI; see
[Keep generated code in sync](./guides/check-in-ci.md).

**It trusts `readOnlyHint` for the hook kind.** A tool gets a query hook only when it is annotated
`readOnlyHint: true`, since a query re-runs its tool on every mount, focus and invalidation, and
MCP's default is `false`. An unannotated write therefore never becomes a query, but a server that
marks a write read-only gets one. `overrides.<tool>.hook` decides per tool.

**It does not follow your code style.** The files come out formatted as Prettier prints them, with
print width 100 and no semicolons, and regenerate byte for byte. Exclude `out` from your formatter
if your style differs.

## Known limits

### `initialData` does not narrow `data`

With `useQuery`, `initialData` makes `data` defined in the type. `useToolQuery` and the generated
query hooks return `UseQueryResult`, so `data` stays possibly `undefined` with `initialData` too.
Check for `undefined`, or use `useSuspenseQuery` with `toolQueryOptions`, whose `data` is always
defined.

### No generator option for raw text results

A tool without `structuredContent` answers with text, and every typed call reads its first text
block as JSON when it parses as JSON: `"2.10"` becomes the number `2.1`, `"true"` the boolean
`true`, and an id of 20 digits loses its last ones. The config has no option to make the generated
client keep the text. Give the tool an `outputSchema` and `structuredContent`, or decode the result
yourself with `parseToolResult(name, await callTool(name, args), { text: "raw" })`; see
[Core API](./reference/core.md#parsetoolresult). An `output: "string"` override does not change the
decoding and is only right for text that never parses as JSON.

### React 18 is allowed but untested

The React package's peer range is `react` `^18.0.0 || ^19.0.0`. The hooks use only what both
versions have: `createContext` with its `.Provider`, `useContext`, `useMemo` and TanStack Query's
hooks. The test suite runs on React 19 only.

### OAuth is not supported at build time

The build-time handshake takes `{ mode: "none" }`, a bearer token or one custom header, and no OAuth
flow. Run the flow once, then pass the access token as `{ mode: "bearer", token }`, for example from
an environment variable; see [Configuration](./reference/configuration.md).

### A union of tool names types the args as a union

`TypedCallTool` and the hooks pick a tool's input by its name. With a name whose type is a union
(`which: "a" | "b"`), the args are typed as the union of both inputs, so args that fit only one tool
compile for either: TypeScript's correlated-union limit. Pass a literal name, as the generated
client's methods and hooks do.

### The CLI needs Node.js 20

The CLI declares Node.js 20 or newer. Node.js loads a `.ts` config from 22.18 on; on an older
version use a `.mjs` config or run the CLI through tsx.

## Next steps

- [Core API](./reference/core.md): the parse rules and `ToolCallError` the typed calls rely on.
- [Keep generated code in sync](./guides/check-in-ci.md): catch a changed server in CI, not at run
  time.
- [Generated code](./reference/generated-code.md): what the generator writes for a well-behaved
  server.
