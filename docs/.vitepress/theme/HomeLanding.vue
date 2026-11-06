<script setup lang="ts">
// The landing page (docs/index.md), from the Miragon docs kit's template (skill docs-site,
// landingpage.md) in the form "grey band, stage first": one row of pitch, the stage across the
// full width on a grey band (LandingStage.vue), then why and the rail.
import { computed, nextTick, provide, ref } from "vue"
import { withBase } from "vitepress"
// Read at build time: release-please bumps the version, so the meta line names the release.
import { engines, version } from "../../../packages/tool-codegen/package.json"
// Written by docs/shots/landing-data.ts from a real run; examples/tasks/test/docs-landing.test.ts
// holds it to the example server and its generated client.
import data from "./landing-data.json"
import LandingStage from "./LandingStage.vue"

// The major of this release, pinned in every command: a package manager that holds fresh releases
// back would otherwise mix the previous major of one package with the current one of the other.
const major = version.split(".")[0]
const generator = `@miragon/mcp-toolkit-tool-codegen@${major}`
const core = `@miragon/mcp-toolkit-tool-codegen-core@${major}`
// The generator runs at build time (a dev dependency), the generated code imports the core.
const installs = [
  { name: "pnpm", prompt: "$", lines: [`pnpm add -D ${generator}`, `pnpm add ${core}`] },
  { name: "npm", prompt: "$", lines: [`npm install -D ${generator}`, `npm install ${core}`] },
  { name: "yarn", prompt: "$", lines: [`yarn add -D ${generator}`, `yarn add ${core}`] },
]
// Each step links to the section of its guide where you do it (anchors as the kit writes them).
const steps = [
  {
    name: "Generate",
    link: "/guides/generate#4-generate",
    command: data.steps.generate,
    effect: "Writes a type per tool input and output.",
  },
  {
    name: "Call",
    link: "/guides/call-tools#3-call-tools-through-the-typed-client",
    command: data.steps.call,
    effect: "Typed calls from Node, a browser or a widget.",
  },
  {
    name: "Render",
    link: "/guides/react-hooks#3-show-a-list-with-a-query-hook",
    command: data.steps.render,
    effect: "With the React package: query hooks for read-only tools, mutations for the rest.",
  },
  {
    name: "Check",
    link: "/guides/check-in-ci#3-run-the-check-in-ci",
    command: data.steps.check,
    effect: "Exits 1 when the server and the files differ.",
  },
]
// true when the work is a loop: the last step points back to 01.
const loop = true
// The link under the install box says what happens next, not "Get started".
const next = { text: "Generate your first client", link: "/getting-started" }
const needs = `Needs Node ${engines.node.replace(/^>=\s*/, "")}+`
const status = { label: version, text: "Keep the generator, core and React package on one minor." }
const why = { ...data.why, tools: data.toolsList.tools, bytes: data.toolsList.bytes }
const formatted = (count: number) => count.toLocaleString("en-US")

const selected = ref(0)
const copied = ref(false)

// One clock for the page (landingpage.md, Bewegung): the tabs are the one group that switches.
// The line under the active tab fills in 6 s, in CSS, so the first paint already runs it, and its
// end selects the next tab. Pause in the stage's title bar, the pointer on the group or the focus
// in it hold the line where it stands. A click or an arrow key chooses a tab and ends the
// switching until the page reloads. With prefers-reduced-motion nothing ever moves.
const paused = ref(false)
provide("landing-paused", paused)
const chosen = ref(false)
const held = ref(false)
const still = computed(() => chosen.value || installs.length < 2)
const stopped = computed(() => paused.value || held.value)
// Pause is offered only while something can still move.
provide(
  "landing-moving",
  computed(() => !still.value),
)

function step(offset: number) {
  selected.value = (selected.value + offset + installs.length) % installs.length
}

function choose(index: number) {
  chosen.value = true
  selected.value = index
}

// Arrow keys move the selection and the focus together (ARIA tabs pattern).
const tabButtons = ref([] as HTMLButtonElement[])
async function selectBy(offset: number) {
  chosen.value = true
  step(offset)
  await nextTick()
  tabButtons.value[selected.value]?.focus()
}

async function copyInstall() {
  await navigator.clipboard.writeText(installs[selected.value].lines.join("\n"))
  copied.value = true
  setTimeout(() => (copied.value = false), 1600)
}
</script>

<template>
  <div class="landing">
    <section class="frame top">
      <div class="pitch">
        <h1>MCP Toolkit</h1>
        <p class="slogan">Your MCP calls are typed by the server, not by hand.</p>
        <p class="lede">
          A build-time CLI turns an MCP server's tools/list into a typed client and, if you want
          them, React hooks. It treats all server text as untrusted input.
        </p>
      </div>

      <div class="get">
        <div
          class="install"
          :class="{ still, stopped }"
          @mouseenter="held = true"
          @mouseleave="held = false"
          @focusin="held = true"
          @focusout="held = false"
        >
          <div class="tabs-row">
            <div
              class="tabs"
              role="tablist"
              aria-label="Install"
              @keydown.right.prevent="selectBy(1)"
              @keydown.left.prevent="selectBy(-1)"
            >
              <button
                v-for="(install, index) in installs"
                :id="`install-tab-${install.name}`"
                :key="install.name"
                ref="tabButtons"
                class="tab"
                type="button"
                role="tab"
                aria-controls="install-panel"
                :aria-selected="index === selected"
                :tabindex="index === selected ? 0 : -1"
                @click="choose(index)"
                @animationend="step(1)"
              >
                {{ install.name }}
              </button>
            </div>
            <button class="copy" type="button" @click="copyInstall">
              <span :class="{ hidden: copied }">Copy</span>
              <span :class="{ hidden: !copied }">Copied</span>
            </button>
          </div>
          <div
            id="install-panel"
            class="command"
            role="tabpanel"
            :aria-labelledby="`install-tab-${installs[selected].name}`"
          >
            <!-- Every channel in one grid cell: switching never changes the box's size. -->
            <div class="channels">
              <pre
                v-for="(install, index) in installs"
                :key="install.name"
                :class="{ hidden: index !== selected }"
                :aria-hidden="index !== selected"
              ><template v-for="line in install.lines" :key="line"><span class="prompt">{{ install.prompt }} </span>{{ line }}
</template></pre>
            </div>
          </div>
        </div>
        <p class="meta">
          <span>{{ needs }}</span>
          <span class="status">
            <span class="marker" aria-hidden="true" />
            <span
              ><strong>{{ status.label }}</strong> {{ status.text }}</span
            >
          </span>
        </p>
        <a class="next" :href="withBase(next.link)"
          >{{ next.text }} <span aria-hidden="true">→</span></a
        >
      </div>
    </section>

    <section class="ground" aria-label="What the server lists and what the CLI writes">
      <div class="frame">
        <LandingStage />
      </div>
    </section>

    <section class="loop" aria-label="Why and how it works">
      <div class="explainer-band">
        <div class="frame explainer">
          <div class="point">
            <h2>Why</h2>
            <p>
              Typed by hand, the {{ why.tools }} tools in the demo are {{ why.places }} places to
              copy from {{ formatted(why.bytes) }} bytes of tools/list: {{ why.names }} names and
              {{ why.fields }} fields, again after every server change. Generated, they take a
              config of {{ why.configLines }} lines, written once, and one command of
              {{ why.commandChars }} characters, <code>{{ why.command }}</code
              >, whose <code>--check</code> exits 1 when server and files drift apart.
            </p>
          </div>
          <div class="point">
            <h2 id="how-it-works">How it works</h2>
            <p>
              The CLI reads tools/list at build time and writes <code>tools.ts</code>, and
              <code>hooks.tsx</code> with <code>react: true</code>. You commit both. In CI,
              <code>generate --check</code> compares them with the server, and the compiler checks
              every call.
            </p>
          </div>
        </div>
      </div>
      <div class="frame steps-frame">
        <ol class="steps" :style="{ '--steps': steps.length }">
          <li v-for="(item, index) in steps" :key="item.name" class="step">
            <div class="rail">
              <span class="node">0{{ index + 1 }}</span>
              <span v-if="loop && index === steps.length - 1" class="back">→ 01</span>
            </div>
            <h3>
              <a :href="withBase(item.link)"
                >{{ item.name }} <span class="go" aria-hidden="true">→</span></a
              >
            </h3>
            <!-- One unbreakable span per word: a line may break between words, never after a "-". -->
            <code
              ><template v-for="(word, w) in item.command.split(' ')" :key="w"
                >{{ w ? " " : "" }}<span class="word">{{ word }}</span></template
              ></code
            >
            <p>{{ item.effect }}</p>
          </li>
        </ol>
      </div>
    </section>
  </div>
</template>

<style scoped>
.landing {
  --gutter: 32px;
  --line: 1px solid var(--cd-ui-linie);
  border-top: var(--line);
}

/* The frame lines up with the navigation bar above it. */
.frame {
  width: 100%;
  max-width: var(--vp-layout-max-width);
  margin: 0 auto;
}

/* One row of pitch: name, slogan and lede on the left, install, meta and the next step right. */
.top {
  display: grid;
  grid-template-columns: minmax(0, 7fr) minmax(0, 5fr);
  gap: 48px;
  align-items: end;
  padding: 32px var(--gutter) 36px;
}
h1 {
  margin: 0;
  font-size: 64px;
  line-height: 1;
  font-weight: 700;
  letter-spacing: -0.045em;
}
.slogan {
  margin: 12px 0 0;
  font-size: 24px;
  line-height: 1.3;
  font-weight: 500;
  letter-spacing: -0.015em;
  text-wrap: balance;
}
.lede {
  max-width: 46ch;
  margin: 10px 0 0;
  color: var(--cd-ui-text-leise);
  line-height: 1.55;
}

.install {
  border: var(--line);
  border-radius: var(--cd-radius-sm);
  background: var(--cd-ui-abschnitt);
}
.tabs-row {
  display: flex;
  align-items: center;
  border-bottom: var(--line);
}
.tabs {
  display: flex;
}
.tab {
  position: relative;
  padding: 11px 14px;
  border-right: var(--line);
  font: 500 13px/1 var(--vp-font-family-mono);
  color: var(--cd-ui-text-leise);
}
.tab:first-child {
  border-top-left-radius: var(--cd-radius-sm);
}
.tab[aria-selected="true"] {
  color: var(--cd-ui-text);
  background: var(--cd-ui-seite);
}
.tab[aria-selected="true"]::after {
  content: "";
  position: absolute;
  right: 0;
  bottom: -1px;
  left: 0;
  height: 2px;
  background: var(--cd-ui-interaktion);
  transform-origin: left;
}
/* While the tabs switch on their own, the line under the active tab fills in the 6 s and its end
   selects the next tab (animationend). Held or paused, it stands where it is. */
@media (prefers-reduced-motion: no-preference) {
  .install:not(.still) .tab[aria-selected="true"]::after {
    animation: fill 6s linear;
  }
  /* As specific as the rule above, which sets the play state too: later in the file, it wins. */
  .install.stopped .tab[aria-selected="true"]::after {
    animation-play-state: paused;
  }
}
@keyframes fill {
  from {
    transform: scaleX(0);
  }
}
/* Both labels in one cell: "Copied" never widens the button. */
.copy {
  display: inline-grid;
  flex: none;
  height: 26px;
  margin: 0 8px 0 auto;
  padding: 0 10px;
  border: var(--line);
  border-radius: var(--cd-radius-sm);
  background: var(--cd-ui-seite);
  font: 500 12px/1 var(--vp-font-family-mono);
  color: var(--cd-ui-text);
}
/* The focus ring of the kit's links, on the buttons too. */
.tab:focus-visible {
  outline: 2px solid var(--cd-ui-fokus);
  outline-offset: -2px;
}
.copy:focus-visible {
  outline: 2px solid var(--cd-ui-fokus);
  outline-offset: 2px;
}
.copy > span {
  grid-area: 1 / 1;
  align-self: center;
}
.copy:hover {
  background: var(--cd-ui-hover);
}
.command {
  padding: 12px 16px;
}
/* Every channel in the same cell; the ones not chosen keep their size, invisible. */
.channels {
  display: grid;
  min-width: 0;
}
.command pre {
  grid-area: 1 / 1;
  margin: 0;
  font: 400 13px/1.7 var(--vp-font-family-mono);
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.hidden {
  visibility: hidden;
}
.command .prompt {
  color: var(--cd-ui-text-leise);
  user-select: none;
}

.meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px 20px;
  margin: 12px 0 0;
  font-size: 13px;
  color: var(--cd-ui-text-leise);
}
.meta > span:first-child {
  font: 400 12px/1.5 var(--vp-font-family-mono);
}
.status {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  color: var(--cd-ui-text);
}
.status strong {
  font: 500 12px/1 var(--vp-font-family-mono);
}
/* From 1.0 on the marker is success. */
.marker {
  flex: none;
  width: 8px;
  height: 8px;
  border-radius: 2px;
  background: var(--cd-ui-success);
}
.next {
  display: inline-block;
  margin-top: 14px;
  font-weight: 600;
  color: var(--cd-ui-link);
  text-decoration: none;
}
.next:hover {
  text-decoration: underline;
  text-underline-offset: 4px;
}

/* The stage stands on a grey band across the full width; grey marks the demo, never the text. */
.ground {
  border-top: var(--line);
  border-bottom: var(--line);
  background: var(--cd-ui-abschnitt);
}

/* Why and the loop, a band below the stage. */
.loop {
  margin-top: 80px;
}
.explainer-band {
  border-top: var(--line);
  border-bottom: var(--line);
}
.explainer {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
}
.point {
  padding: 14px var(--gutter) 16px;
}
.point + .point {
  border-left: var(--line);
}
.point h2 {
  margin: 0 0 4px;
  padding: 0;
  border: 0;
  font: 500 12px/20px var(--vp-font-family-mono);
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--cd-ui-text-leise);
}
.point p {
  margin: 0;
  font-size: 15px;
  line-height: 23px;
}
/* A command or flag never breaks at its hyphen ("--check"). */
.point code {
  font: 400 14px/1 var(--vp-font-family-mono);
  white-space: nowrap;
}
.steps {
  display: grid;
  grid-template-columns: repeat(var(--steps), minmax(0, 1fr));
  margin: 0;
  padding: 0;
  list-style: none;
}
.step {
  padding: 0 var(--gutter) 24px;
  border-right: var(--line);
}
.step:last-child {
  border-right: 0;
}
/* The rail stays neutral: the arrow on the stage is the page's one accent. */
.rail {
  position: relative;
  display: flex;
  align-items: center;
  height: 56px;
}
.rail::before {
  content: "";
  position: absolute;
  top: 50%;
  right: calc(-1 * var(--gutter));
  left: calc(-1 * var(--gutter));
  height: 1px;
  background: var(--cd-ui-kontur);
}
.step:first-child .rail::before {
  left: 0;
}
.step:last-child .rail::before {
  right: 0;
}
.step:not(:last-child) .rail::after {
  content: "";
  position: absolute;
  top: 50%;
  right: calc(-1 * var(--gutter) + 6px);
  margin-top: -5px;
  border-top: 5px solid transparent;
  border-bottom: 5px solid transparent;
  border-left: 8px solid var(--cd-ui-kontur);
}
.node {
  position: relative;
  display: inline-grid;
  place-items: center;
  height: 26px;
  min-width: 34px;
  padding: 0 6px;
  border: 1px solid var(--cd-ui-kontur);
  border-radius: 4px;
  background: var(--cd-ui-seite);
  font: 500 12px/1 var(--vp-font-family-mono);
}
.back {
  position: relative;
  margin-left: auto;
  padding: 4px 0 4px 10px;
  background: var(--cd-ui-seite);
  font: 500 12px/1 var(--vp-font-family-mono);
  color: var(--cd-ui-text-leise);
}
.step h3 {
  margin: 2px 0 10px;
  font-size: 26px;
  line-height: 1.15;
  font-weight: 700;
  letter-spacing: -0.03em;
}
.step h3 a {
  display: inline-flex;
  align-items: baseline;
  gap: 10px;
  color: inherit;
  text-decoration: none;
}
.step h3 a:hover {
  text-decoration: underline;
  text-decoration-thickness: 2px;
  text-decoration-color: var(--cd-ui-interaktion);
  text-underline-offset: 5px;
}
.go {
  font: 500 18px/1 var(--vp-font-family-mono);
  color: var(--cd-ui-text-leise);
  transition:
    transform var(--cd-motion-fast) var(--cd-ease),
    color var(--cd-motion-fast) var(--cd-ease);
}
.step h3 a:hover .go {
  color: var(--cd-ui-link);
  transform: translateX(3px);
}
.step code {
  display: block;
  padding: 6px 10px;
  border: var(--line);
  border-radius: 4px;
  background: var(--cd-ui-abschnitt);
  font: 400 13px/1.5 var(--vp-font-family-mono);
  overflow-wrap: anywhere;
}
.step code .word {
  white-space: nowrap;
}
.step p {
  margin: 10px 0 0;
  font-size: 15px;
  color: var(--cd-ui-text-leise);
}

/* Wider than the frame, side lines close the cells of the band, as in the kit's template. */
@media (min-width: 1441px) {
  .explainer,
  .steps-frame {
    border-right: var(--line);
    border-left: var(--line);
  }
}

@media (max-width: 959px) {
  .top {
    grid-template-columns: minmax(0, 1fr);
    gap: 28px;
  }
  .explainer,
  .steps {
    grid-template-columns: minmax(0, 1fr);
  }
  .point + .point {
    border-top: var(--line);
    border-left: 0;
  }
  .step {
    border-right: 0;
  }
}

@media (max-width: 640px) {
  .landing {
    --gutter: 20px;
  }
  .top {
    padding-top: 40px;
  }
  h1 {
    font-size: clamp(40px, 12vw, 56px);
  }
  .slogan {
    font-size: 21px;
  }
  .command pre {
    font-size: 12px;
  }
  .loop {
    margin-top: 56px;
  }
  .step {
    display: grid;
    grid-template-columns: 34px 1fr;
    column-gap: 16px;
    padding: 0 var(--gutter);
  }
  .rail {
    grid-row: 1 / span 3;
    flex-direction: column;
    align-items: center;
    height: auto;
    padding-top: 22px;
  }
  .rail::before {
    top: 0;
    right: auto;
    bottom: 0;
    left: 50%;
    width: 1px;
    height: auto;
  }
  .step:first-child .rail::before {
    top: 34px;
    left: 50%;
  }
  .step:last-child .rail::before {
    right: auto;
    bottom: auto;
    height: 35px;
  }
  .step:not(:last-child) .rail::after {
    top: auto;
    right: auto;
    bottom: 4px;
    left: 50%;
    margin: 0 0 0 -5px;
    border-top: 8px solid var(--cd-ui-kontur);
    border-right: 5px solid transparent;
    border-bottom: 0;
    border-left: 5px solid transparent;
  }
  .back {
    display: none;
  }
  .step h3 {
    margin: 20px 0 10px;
    font-size: 24px;
  }
  .step p {
    padding-bottom: 28px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .go {
    transition: none;
  }
}
</style>
