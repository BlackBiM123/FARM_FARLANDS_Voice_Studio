<script setup lang="ts">
import { onMounted, onUnmounted, ref } from "vue";
const preview = ref<{
  src: string;
  alt: string;
  x: number;
  y: number;
  width: number;
  height: number;
} | null>(null);
function enter(event: PointerEvent) {
  if (event.pointerType === "touch") return;
  const target = event.target;
  if (
    !(target instanceof HTMLImageElement) ||
    !target.closest(".photo-editor,.portrait,.tree-person,.family-members")
  )
    return;
  const box = target.getBoundingClientRect(),
    margin = 12,
    gap = 18;
  const maxWidth = Math.min(320, window.innerWidth - margin * 2),
    maxHeight = Math.min(420, window.innerHeight - margin * 2);
  const ratio = (target.naturalWidth || 1) / (target.naturalHeight || 1);
  const width = Math.min(maxWidth, (maxHeight - 48) * ratio + 24),
    height = Math.min(maxHeight, (width - 24) / ratio + 48);
  let x = box.right + gap;
  if (x + width > window.innerWidth - margin) x = box.left - width - gap;
  x = Math.max(margin, Math.min(x, window.innerWidth - width - margin));
  const y = Math.max(
    margin,
    Math.min(box.top, window.innerHeight - height - margin),
  );
  preview.value = {
    src: target.currentSrc || target.src,
    alt: target.alt || "Изображение персонажа",
    x,
    y,
    width,
    height,
  };
}
function leave(event: PointerEvent) {
  if (event.target instanceof HTMLImageElement) hide();
}
function hide() {
  preview.value = null;
}
function key(event: KeyboardEvent) {
  if (event.key === "Escape") hide();
}
onMounted(() => {
  document.addEventListener("pointerover", enter);
  document.addEventListener("pointerout", leave);
  window.addEventListener("scroll", hide, true);
  window.addEventListener("resize", hide);
  document.addEventListener("keydown", key);
});
onUnmounted(() => {
  document.removeEventListener("pointerover", enter);
  document.removeEventListener("pointerout", leave);
  window.removeEventListener("scroll", hide, true);
  window.removeEventListener("resize", hide);
  document.removeEventListener("keydown", key);
});
</script>
<template>
  <Teleport to="body"
    ><div
      v-if="preview"
      class="image-hover-preview"
      role="tooltip"
      :style="{
        left: preview.x + 'px',
        top: preview.y + 'px',
        width: preview.width + 'px',
        height: preview.height + 'px',
      }"
    >
      <img :src="preview.src" :alt="preview.alt" /><span>{{
        preview.alt
      }}</span>
    </div></Teleport
  >
</template>
