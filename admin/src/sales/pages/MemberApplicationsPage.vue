<script setup lang="ts">import SalesRoutePage from './SalesRoutePage.vue'; defineProps<{ state: string }>();</script>
<template><SalesRoutePage route="/sales/applications" title="会员申请" description="审核用户的会员申请，确认归属并开启健康服务旅程。" :state="state"><template #actions><slot name="actions" /></template><slot /></SalesRoutePage></template>
