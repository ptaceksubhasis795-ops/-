<script setup lang="ts">
withDefaults(defineProps<{
  state: "loading" | "empty" | "error" | "forbidden" | "saving" | "success";
  message?: string;
  testid?: string;
}>(), { message: "", testid: "sales-state" });
</script>

<template>
  <div class="sales-state" :class="`sales-state-${state}`" :data-visual-state="state" :data-testid="testid" role="status">
    <span class="sales-state-icon" aria-hidden="true"></span>
    <strong>{{ message || (state === 'loading' ? '正在加载…' : state === 'empty' ? '暂无记录' : state === 'forbidden' ? '暂无权限' : state === 'saving' ? '正在保存…' : state === 'success' ? '已保存' : '加载失败') }}</strong>
    <slot />
  </div>
</template>
