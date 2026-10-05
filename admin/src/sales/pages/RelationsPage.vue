<script setup lang="ts">import SalesRoutePage from './SalesRoutePage.vue'; defineProps<{ state: string }>();</script>
<template><SalesRoutePage route="/sales/relations" title="关系树" description="公司 → 销售人员 → 会员 → 客户；每次绑定和解除都留下原因。" :state="state"><template #actions><slot name="actions" /></template><slot /></SalesRoutePage></template>
