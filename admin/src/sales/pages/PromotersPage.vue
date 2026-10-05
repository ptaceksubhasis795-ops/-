<script setup lang="ts">import SalesRoutePage from './SalesRoutePage.vue'; defineProps<{ state: string }>();</script>
<template><SalesRoutePage route="/sales/promoters" title="推广人" description="管理推广人账号，支持新增、查询、归档和历史记录。" :state="state"><template #actions><slot name="actions" /></template><slot /></SalesRoutePage></template>
