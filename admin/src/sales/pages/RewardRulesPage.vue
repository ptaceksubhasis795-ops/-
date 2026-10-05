<script setup lang="ts">import SalesRoutePage from './SalesRoutePage.vue'; defineProps<{ state: string }>();</script>
<template><SalesRoutePage route="/sales/rules" title="奖励规则" description="按商品维护销售人员、会员与公司三档奖励方式。" :state="state"><template #actions><slot name="actions" /></template><slot /></SalesRoutePage></template>
