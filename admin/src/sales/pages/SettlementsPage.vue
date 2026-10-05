<script setup lang="ts">import SalesRoutePage from './SalesRoutePage.vue'; defineProps<{ state: string }>();</script>
<template><SalesRoutePage route="/sales/settlements" title="周结算" description="先确认可结算奖励，再生成当周批次；同一周期保持幂等。" :state="state"><template #actions><slot name="actions" /></template><slot /></SalesRoutePage></template>
