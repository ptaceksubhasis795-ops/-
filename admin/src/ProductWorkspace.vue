<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import EnterpriseModules from "./EnterpriseModules.vue";

const route = useRoute();
const router = useRouter();
const subpage = computed(() => String(route.params.subpage || "catalog"));
const tabs = [["catalog", "商品列表"], ["skus", "SKU 规格"], ["inventory", "库存批次"], ["rewards", "奖励摘要"]] as const;
const ready = ref(true);
onMounted(() => { ready.value = true; });
</script>

<template>
  <section class="nested-workspace"><header class="nested-header"><div><p class="eyebrow">运营 / 商品</p><h1>商品与库存</h1><p>商品、SKU、批次和奖励摘要拆成独立入口。</p></div></header><nav class="nested-tabs"><button v-for="item in tabs" :key="item[0]" :class="{ active: subpage === item[0] }" type="button" @click="router.push(`/products/${item[0]}`)">{{ item[1] }}</button></nav><div v-if="ready" class="embedded-module"><EnterpriseModules active="products" role="admin" /></div></section>
</template>

<style scoped>
.embedded-module { margin-top: -18px; }
.embedded-module :deep(.enterprise-head) { display: none; }
</style>
