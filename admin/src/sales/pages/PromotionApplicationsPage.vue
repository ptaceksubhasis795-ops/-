<script setup lang="ts">import SalesRoutePage from './SalesRoutePage.vue'; defineProps<{ state: string }>();</script>
<template><SalesRoutePage route="/sales/promotion-applications" title="会员晋升申请" description="查看连续三个月业绩快照，并按服务端门槛审核晋升。" :state="state"><template #actions><slot name="actions" /></template><slot /></SalesRoutePage></template>
