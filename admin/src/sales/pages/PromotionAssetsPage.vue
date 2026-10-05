<script setup lang="ts">import SalesRoutePage from './SalesRoutePage.vue'; defineProps<{ state: string }>();</script>
<template><SalesRoutePage route="/sales/assets" title="推广素材" description="查看真实分享路径、二维码参数、海报配置和轮播素材。" :state="state"><template #actions><slot name="actions" /></template><slot /></SalesRoutePage></template>
