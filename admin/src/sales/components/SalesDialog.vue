<script setup lang="ts">
withDefaults(defineProps<{ open?: boolean; title?: string; description?: string; testid?: string }>(), { open: false, title: "", description: "", testid: "sales-dialog" });
const emit = defineEmits<{ close: [] }>();
</script>

<template>
  <div v-if="open" class="dialog-backdrop sales-dialog-backdrop" :data-testid="testid" @click.self="emit('close')">
    <section class="dialog-card sales-dialog-card" role="dialog" aria-modal="true" :aria-label="title">
      <div class="dialog-head"><div><p class="panel-kicker">销售工作台</p><h2>{{ title }}</h2></div><button type="button" class="icon-button" aria-label="关闭" @click="emit('close')">×</button></div>
      <p v-if="description" class="dialog-note">{{ description }}</p>
      <slot />
    </section>
  </div>
</template>
