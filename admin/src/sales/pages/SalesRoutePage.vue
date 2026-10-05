<script setup lang="ts">
defineProps<{ route: string; title: string; description: string; state: string }>();
</script>

<template>
  <section class="sales-route-page" :data-route="route" :data-visual-state="state">
    <header class="sales-route-header nested-header">
      <div>
        <p class="sales-route-eyebrow">销售运营 / {{ title }}</p>
        <h1>{{ title }}</h1>
        <p class="sales-route-description">{{ description }}</p>
      </div>
      <div class="sales-route-actions"><slot name="actions" /></div>
    </header>
    <slot />
  </section>
</template>
