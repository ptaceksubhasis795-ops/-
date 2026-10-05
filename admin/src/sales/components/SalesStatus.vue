<script setup lang="ts">
withDefaults(defineProps<{ value?: string; tone?: "teal" | "amber" | "coral" | "plum" | "slate" }>(), { value: "未知", tone: "slate" });
</script>

<template><span class="sales-status" :class="`sales-status-${tone}`">{{ value }}</span></template>
