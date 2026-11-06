<script setup lang="ts">
// The kit's layout, unchanged, with one line under VitePress' own 404 block (the kit sets its
// texts) for a reader who followed a link into the 2.x docs, which this site no longer builds;
// their old pages redirect from docs/public/. The default theme exports no NotFound, so the
// import names its file.
import VPNotFound from "vitepress/dist/client/theme-default/NotFound.vue"
import MiragonTheme from "../miragon/theme"

const MiragonLayout = MiragonTheme.Layout
</script>

<template>
  <MiragonLayout>
    <template #not-found>
      <div class="not-found">
        <VPNotFound />
        <p class="old-docs">
          The 2.x docs (core, ui, playground) live at the tag
          <a href="https://github.com/Miragon/mcp-toolkit/tree/v2.9.0/docs">v2.9.0</a>.
        </p>
      </div>
    </template>
  </MiragonLayout>
</template>

<style scoped>
/* The line takes the space VitePress leaves below its block. */
.not-found :deep(.NotFound) {
  padding-bottom: 0;
}
.old-docs {
  margin: 0;
  padding: 24px 24px 96px;
  text-align: center;
  font-size: 14px;
  color: var(--cd-ui-text-leise);
}
.old-docs a {
  color: var(--cd-ui-link);
  text-decoration: underline;
  text-underline-offset: 3px;
}
@media (min-width: 768px) {
  .old-docs {
    padding-bottom: 168px;
  }
}
</style>
