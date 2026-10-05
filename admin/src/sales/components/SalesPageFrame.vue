<script setup lang="ts">
withDefaults(defineProps<{
  route?: string;
  state?: string;
  testid?: string;
}>(), { route: "", state: "ready", testid: "sales-page" });
</script>

<template>
  <section
    class="nested-workspace sales-workspace sales-page-frame"
    :data-route="route"
    :data-visual-state="state"
    :data-testid="testid"
  >
    <slot />
  </section>
</template>
