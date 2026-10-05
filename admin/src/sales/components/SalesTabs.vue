<script setup lang="ts">
withDefaults(defineProps<{ items: Array<{ key: string; label: string; count?: number }>; active: string; testid?: string }>(), { testid: "sales-tabs" });
const emit = defineEmits<{ select: [key: string] }>();
</script>
<template><nav class="nested-tabs sales-tabs" aria-label="销售子栏目" :data-testid="testid"><button v-for="item in items" :key="item.key" :data-testid="`sales-tab-${item.key}`" type="button" :class="{ active: item.key === active }" :aria-current="item.key === active ? 'page' : undefined" @click="emit('select', item.key)">{{ item.label }}<span v-if="item.count !== undefined" class="tab-count" :aria-label="`${item.label}数量`">{{ item.count }}</span></button></nav></template>
