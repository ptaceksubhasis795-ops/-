<script setup lang="ts">
withDefaults(defineProps<{ open?: boolean; title?: string; testid?: string }>(), { open: false, title: "详情", testid: "sales-drawer" });
const emit = defineEmits<{ close: [] }>();
</script>

<template>
  <aside v-if="open" class="sales-drawer" :data-testid="testid" role="dialog" aria-modal="true" :aria-label="title">
    <header class="sales-drawer-head"><h2>{{ title }}</h2><button type="button" class="icon-button" aria-label="关闭" @click="emit('close')">×</button></header>
    <div class="sales-drawer-body"><slot /></div>
  </aside>
</template>
