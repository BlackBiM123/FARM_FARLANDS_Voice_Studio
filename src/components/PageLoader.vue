<script setup lang="ts">
defineProps<{ label?: string }>();
</script>
<template>
  <div class="page-loader" role="status" aria-live="polite">
    <span class="loading-spinner" aria-hidden="true"></span
    ><span>{{ label || "Загрузка страницы…" }}</span>
  </div>
</template>
