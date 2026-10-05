<script setup lang="ts">import SalesRoutePage from './SalesRoutePage.vue'; defineProps<{ state: string }>();</script>
<template><SalesRoutePage route="/sales/agent-orders" title="代客订单" description="销售创建草稿，客户确认地址后生成正式订单；后台只读追踪状态。" :state="state"><template #actions><slot name="actions" /></template><slot /></SalesRoutePage></template>
