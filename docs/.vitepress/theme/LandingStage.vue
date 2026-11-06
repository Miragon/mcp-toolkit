<script setup lang="ts">
// The stage of the landing page, archetype "before and after": on the left one entry of the
// example server's tools/list, on the right what mcp-tool-codegen wrote for it in tools.ts. All
// text and numbers come from landing-data.json (docs/shots/landing-data.ts, a real run); this file
// only lays them out. The blue arrow between the cards is the page's one accent.
import { inject, ref, type Ref } from "vue"
import data from "./landing-data.json"

interface Token {
  text: string
  quiet?: boolean
}

// Code on the stage takes roles only: strings, comments and cuts quiet, everything else text.
const STRING = /"(?:[^"\\]|\\.)*"/y

/** A line of the JSON entry: keys stay text, values and the marked cut are quiet. */
function jsonTokens(line: string): Token[] {
  const cut = /\{ … .* … \}/.exec(line)
  if (cut) {
    return [
      ...jsonTokens(line.slice(0, cut.index)),
      { text: cut[0], quiet: true },
      ...jsonTokens(line.slice(cut.index + cut[0].length)),
    ]
  }
  return tokens(line, (match, rest) => !/^\s*:/.test(rest))
}

/** A line of tools.ts: comments and strings quiet, keywords and names as text. */
function tsTokens(line: string): Token[] {
  if (/^\s*(\/\*|\*)/.test(line)) return [{ text: line, quiet: true }]
  return tokens(line, () => true)
}

function tokens(line: string, quietString: (match: string, rest: string) => boolean): Token[] {
  const out: Token[] = []
  let plain = ""
  for (let at = 0; at < line.length;) {
    STRING.lastIndex = at
    const match = line[at] === '"' ? STRING.exec(line)?.[0] : undefined
    if (match === undefined) {
      plain += line[at]
      at += 1
      continue
    }
    if (plain) out.push({ text: plain })
    plain = ""
    at += match.length
    out.push({ text: match, quiet: quietString(match, line.slice(at)) })
  }
  if (plain) out.push({ text: plain })
  return out
}

const entry = data.toolsList.entry.map(jsonTokens)
// The excerpts under the file's own line numbers; a gap row marks each cut.
const rows = data.toolsTs.excerpts.flatMap((excerpt, index) => [
  ...(index > 0 ? [{ number: "⋮", gap: true, tokens: [] as Token[] }] : []),
  ...excerpt.lines.map((line, offset) => ({
    number: String(excerpt.from + offset),
    gap: false,
    tokens: tsTokens(line),
  })),
])
const formatted = (count: number) => count.toLocaleString("en-US")

// The page's one clock (HomeLanding.vue): Pause stops the switching install tabs (WCAG 2.2.2).
// Once a tab is chosen nothing moves, so the button hides and keeps its space. It stands in the
// stage's title bar: at the right of the second card, and in the first card's head once the cards
// stack, so it stays near the tabs it stops.
const paused = inject("landing-paused", ref(false))
const moving = inject<Readonly<Ref<boolean>>>("landing-moving", ref(true))
function toggle() {
  paused.value = !paused.value
}
const labels = {
  entry: `The ${data.toolsList.tool} entry of tools/list`,
  excerpts: `Excerpts of ${data.toolsTs.file}`,
}
</script>

<template>
  <div class="pair">
    <figure class="card">
      <figcaption class="card-head">
        <b>tools/list</b>
        <span class="head-end">
          <span
            ><span class="num">{{ data.toolsList.tools }}</span> tools ·
            <span class="num">{{ formatted(data.toolsList.bytes) }}</span> bytes</span
          >
          <button class="toggle narrow" :class="{ gone: !moving }" type="button" @click="toggle">
            <span class="icon" :class="{ play: paused }" aria-hidden="true" />{{
              paused ? "Play" : "Pause"
            }}
          </button>
        </span>
      </figcaption>
      <!-- Scrolls sideways when narrow, so the keyboard can reach it too. -->
      <pre
        class="code"
        tabindex="0"
        role="region"
        :aria-label="labels.entry"
      ><span v-for="(line, index) in entry" :key="index" class="row"><span v-for="(token, at) in line" :key="at" :class="{ quiet: token.quiet }">{{ token.text }}</span></span></pre>
    </figure>

    <div class="arrow" role="img" aria-label="becomes" />

    <figure class="card">
      <figcaption class="card-head">
        <b>{{ data.toolsTs.file }}</b>
        <span class="head-end">
          <span
            ><span class="num">{{ data.toolsTs.lines }}</span> lines</span
          >
          <button class="toggle wide" :class="{ gone: !moving }" type="button" @click="toggle">
            <span class="icon" :class="{ play: paused }" aria-hidden="true" />{{
              paused ? "Play" : "Pause"
            }}
          </button>
        </span>
      </figcaption>
      <pre
        class="code"
        tabindex="0"
        role="region"
        :aria-label="labels.excerpts"
      ><span v-for="(row, index) in rows" :key="index" class="row" :class="{ gap: row.gap }"><span class="ln" aria-hidden="true">{{ row.number }}</span><span v-for="(token, at) in row.tokens" :key="at" :class="{ quiet: token.quiet }">{{ token.text }}</span></span></pre>
    </figure>
  </div>
</template>

<style scoped>
.pair {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 72px minmax(0, 1fr);
  align-items: stretch;
  padding: 24px var(--gutter);
}

/* The cards follow the mode: code and JSON are text, not a drawing. */
.card {
  min-width: 0;
  margin: 0;
  border: var(--line);
  border-radius: var(--cd-radius-sm);
  background: var(--cd-ui-seite);
  overflow: hidden;
}
.card-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
  height: 34px;
  padding: 0 16px;
  border-bottom: var(--line);
  font: 500 12px/1 var(--vp-font-family-mono);
  color: var(--cd-ui-text-leise);
  white-space: nowrap;
}
.card-head b {
  font-weight: 500;
  color: var(--cd-ui-text);
}
.card-head .num {
  color: var(--cd-ui-text);
}
.head-end {
  display: inline-flex;
  align-items: center;
  gap: 20px;
}
.toggle {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin: 0 -6px;
  padding: 4px 6px;
  border-radius: var(--cd-radius-sm);
  font: 500 12px/1 var(--vp-font-family-mono);
  color: var(--cd-ui-text-leise);
}
.toggle:hover {
  background: var(--cd-ui-hover);
  color: var(--cd-ui-text);
}
.toggle:focus-visible {
  outline: 2px solid var(--cd-ui-fokus);
  outline-offset: 2px;
}
.toggle .icon {
  width: 8px;
  height: 9px;
  border-right: 3px solid currentColor;
  border-left: 3px solid currentColor;
}
.toggle .icon.play {
  width: 0;
  height: 0;
  border-top: 5px solid transparent;
  border-right: 0;
  border-bottom: 5px solid transparent;
  border-left: 8px solid currentColor;
}
/* One toggle shows at a time: in the second card's head side by side, in the first stacked. */
.toggle.narrow {
  display: none;
}
/* A chosen tab stops the switching for good: nothing left to pause, and "144 lines" stays put. */
.toggle.gone {
  visibility: hidden;
}

.code {
  margin: 0;
  padding: 10px 16px 12px;
  overflow-x: auto;
  overflow-y: hidden;
  font: 400 12.5px/1.55 var(--vp-font-family-mono);
  color: var(--cd-ui-text);
  white-space: pre;
}
.code:focus-visible {
  outline: 2px solid var(--cd-ui-fokus);
  outline-offset: -2px;
}
.row {
  display: block;
}
.quiet,
.gap {
  color: var(--cd-ui-text-leise);
}
.ln {
  display: inline-block;
  width: 3ch;
  margin-right: 1.5ch;
  text-align: right;
  color: var(--cd-ui-text-leise);
  user-select: none;
}

.arrow {
  position: relative;
  align-self: center;
  height: 2px;
  margin: 0 14px;
  background: var(--cd-ui-icon-akzent);
}
.arrow::after {
  content: "";
  position: absolute;
  top: -6px;
  right: -2px;
  border-top: 7px solid transparent;
  border-bottom: 7px solid transparent;
  border-left: 11px solid var(--cd-ui-icon-akzent);
}

@media (max-width: 1360px) {
  .code {
    font-size: 11.5px;
  }
}
@media (max-width: 959px) {
  .pair {
    grid-template-columns: minmax(0, 1fr);
  }
  .toggle.wide {
    display: none;
  }
  .toggle.narrow {
    display: inline-flex;
  }
  .arrow {
    justify-self: center;
    width: 2px;
    height: 40px;
    margin: 10px 0 14px;
  }
  .arrow::after {
    top: auto;
    right: auto;
    bottom: -2px;
    left: -6px;
    border-top: 11px solid var(--cd-ui-icon-akzent);
    border-right: 7px solid transparent;
    border-bottom: 0;
    border-left: 7px solid transparent;
  }
}
@media (max-width: 640px) {
  .pair {
    padding: 20px 12px;
  }
  .code {
    font-size: 12px;
  }
}
/* Nothing moves with reduced motion, so there is nothing to pause. */
@media (prefers-reduced-motion: reduce) {
  .toggle.wide,
  .toggle.narrow {
    display: none;
  }
}
</style>
