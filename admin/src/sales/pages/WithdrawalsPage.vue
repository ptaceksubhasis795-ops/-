<script setup lang="ts">import SalesRoutePage from './SalesRoutePage.vue'; defineProps<{ state: string }>();</script>
<template><SalesRoutePage route="/sales/withdrawals" title="提现审核" description="审核提现申请，记录第三方凭证并独立确认到账。" :state="state"><template #actions><slot name="actions" /></template><slot /></SalesRoutePage></template>
