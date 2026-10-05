<script setup lang="ts">import SalesRoutePage from './SalesRoutePage.vue'; defineProps<{ state: string }>();</script>
<template><SalesRoutePage route="/sales/rewards" title="奖励台账" description="追踪待生效、可结算、已结算和售后扣回的奖励记录。" :state="state"><template #actions><slot name="actions" /></template><slot /></SalesRoutePage></template>
