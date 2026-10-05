<script setup lang="ts">import SalesRoutePage from './SalesRoutePage.vue'; defineProps<{ state: string }>();</script>
<template><SalesRoutePage route="/sales/overview" title="销售概览" description="数据驱动增长 · 让更多人收获健康" :state="state"><template #actions><slot name="actions" /></template><slot /></SalesRoutePage></template>
