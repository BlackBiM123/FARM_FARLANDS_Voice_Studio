<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount, onUnmounted, ref } from "vue";
import { BookOpen, X } from "lucide-vue-next";
import type { Family } from "../../shared/family";
const props = defineProps<{ family: Family }>();
const emit = defineEmits<{ close: [] }>();
const dialog = ref<HTMLDialogElement | null>(null);
const previousFocus = document.activeElement as HTMLElement | null;
const previousOverflow = document.body.style.overflow;
const sections = computed(() => {
  const text = (props.family.story || "").trim();
  if (!text) return [];
  return text
    .split(/(?=^Глава [IVXLC]+\.)/m)
    .filter(Boolean)
    .map((part, index) => {
      const lines = part.trim().split(/\n\s*\n/);
      return {
        id: `family-story-${index}`,
        title: lines.shift() || "",
        paragraphs: lines,
      };
    });
});
const chapters = computed(() =>
  sections.value.filter((s) => s.title.startsWith("Глава ")),
);
const subtitles = new Set([
  "Клетки",
  "Резня",
  "Пограничная служба",
  "Семья",
  "Школьные годы",
  "Смерть бабушки",
]);
function jump(id: string) {
  document
    .getElementById(id)
    ?.scrollIntoView({
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "instant"
        : "smooth",
      block: "start",
    });
}
onMounted(() => {
  dialog.value?.showModal();
  document.body.style.overflow = "hidden";
});
onBeforeUnmount(() => {
  dialog.value?.close();
  document.body.style.overflow = previousOverflow;
});
onUnmounted(() => previousFocus?.focus());
</script>
<template>
  <Teleport to="body">
    <dialog
      ref="dialog"
      class="family-story-dialog"
      aria-labelledby="family-story-title"
      @cancel.prevent="emit('close')"
    >
      <header class="family-story-header">
        <div>
          <BookOpen :size="24" aria-hidden="true" />
          <div>
            <small>ИСТОРИЯ СЕМЬИ</small>
            <h2 id="family-story-title">{{ family.name }}</h2>
          </div>
        </div>
        <button aria-label="Закрыть историю" @click="emit('close')">
          <X :size="22" aria-hidden="true" />
        </button>
      </header>
      <div
        class="family-story-layout"
        :class="{ 'is-empty': !sections.length }"
      >
        <nav
          v-if="chapters.length"
          aria-label="Оглавление истории"
          class="family-story-toc"
        >
          <p>Оглавление</p>
          <button
            v-for="chapter in chapters"
            :key="chapter.id"
            @click="jump(chapter.id)"
          >
            {{ chapter.title }}
          </button>
        </nav>
        <div
          class="family-story-scroll"
          tabindex="0"
          aria-label="Текст истории"
        >
          <article v-if="sections.length" class="family-story-prose">
            <section
              v-for="section in sections"
              :id="section.id"
              :key="section.id"
            >
              <h3>{{ section.title }}</h3>
              <template
                v-for="(paragraph, index) in section.paragraphs"
                :key="index"
              >
                <h4 v-if="subtitles.has(paragraph.trim())">{{ paragraph }}</h4>
                <p
                  v-else
                  :class="{ 'story-dialogue': paragraph.startsWith('—') }"
                >
                  {{ paragraph }}
                </p>
              </template>
            </section>
          </article>
        </div>
      </div>
    </dialog>
  </Teleport>
</template>
<style>
.family-story-button {
  width: 100%;
  min-height: 96px;
  margin: 0 0 24px;
  padding: 22px 28px;
  justify-content: flex-start;
  gap: 20px;
  border: 1px solid #b58a43;
  border-radius: 12px;
  background: linear-gradient(120deg, #493722, #292722);
  color: #f4d49b;
  box-shadow: 0 6px 24px #0003;
  text-align: left;
}
.family-story-button:hover {
  background: linear-gradient(120deg, #60472a, #373128);
  border-color: #e6ae50;
}
.family-story-button span {
  display: flex;
  flex-direction: column;
  gap: 5px;
}
.family-story-button strong {
  font-size: 24px;
}
.family-story-button small {
  color: #c9b99c;
  font-size: 14px;
}
.family-story-button .family-story-arrow {
  margin-left: auto;
  font-size: 30px;
}
.family-story-dialog {
  position: fixed;
  inset: 0;
  margin: auto;
  padding: 0;
  width: min(1120px, calc(100vw - 40px));
  height: min(860px, calc(100dvh - 40px));
  max-width: none;
  max-height: none;
  border: 1px solid #756044;
  border-radius: 16px;
  background: #191a1c;
  color: #e6e0d5;
  box-shadow: 0 30px 100px #0009;
  overflow: hidden;
}
.family-story-dialog::backdrop {
  background: #080a10c9;
  backdrop-filter: blur(6px);
}
.family-story-header {
  min-height: 90px;
  padding: 20px 28px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
  border-bottom: 1px solid #ffffff14;
  background: #24221f;
}
.family-story-header > div {
  display: flex;
  align-items: center;
  gap: 16px;
  color: #e6ae50;
}
.family-story-header h2 {
  margin: 4px 0 0;
  color: #f3e6d0;
  font-size: 22px;
}
.family-story-header small {
  font:
    11px "Segoe UI",
    sans-serif;
  letter-spacing: 0.15em;
}
.family-story-layout {
  display: grid;
  grid-template-columns: 255px minmax(0, 1fr);
  height: calc(100% - 90px);
}
.family-story-layout.is-empty {
  grid-template-columns: 1fr;
}
.family-story-toc {
  overflow-y: auto;
  padding: 24px 16px;
  border-right: 1px solid #ffffff12;
}
.family-story-toc p {
  margin: 0 12px 16px;
  color: #c6a66f;
  font-size: 13px;
}
.family-story-toc button {
  display: block;
  width: 100%;
  text-align: left;
  border: 0;
  background: transparent;
  padding: 12px;
  color: #c5bfb4;
  font-size: 13px;
  line-height: 1.6;
}
.family-story-toc button:hover {
  background: #c6a66f14;
  color: #f2d49d;
}
.family-story-scroll {
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: 40px clamp(24px, 5vw, 68px) 64px;
}
.family-story-prose {
  max-width: 680px;
  margin: 0 auto;
  font-family: Georgia, "Times New Roman", serif;
  font-size: 19px;
  line-height: 1.85;
}
.family-story-prose section {
  scroll-margin-top: 28px;
}
.family-story-prose section + section {
  padding-top: 24px;
  margin-top: 32px;
  border-top: 1px solid #c6a66f25;
}
.family-story-prose h3 {
  font-size: 28px;
  line-height: 1.35;
  margin: 0 0 28px;
  color: #efcf96;
  font-weight: normal;
}
.family-story-prose h4 {
  font-size: 22px;
  color: #debe89;
  margin: 32px 0 16px;
}
.family-story-prose p {
  margin: 0 0 22px;
}
.family-story-prose .story-dialogue {
  padding-left: 20px;
  border-left: 2px solid #b58a43;
  font-style: italic;
}
@media (max-width: 700px) {
  .family-story-dialog {
    width: calc(100vw - 16px);
    height: calc(100dvh - 16px);
    border-radius: 12px;
  }
  .family-story-header {
    padding: 16px;
  }
  .family-story-layout {
    display: flex;
    flex-direction: column;
  }
  .family-story-toc {
    flex: 0 0 auto;
    max-height: 135px;
    border-right: 0;
    border-bottom: 1px solid #ffffff12;
    padding: 10px 16px;
  }
  .family-story-toc p {
    margin-bottom: 6px;
  }
  .family-story-toc button {
    padding: 6px 12px;
  }
  .family-story-scroll {
    min-height: 0;
    flex: 1;
    padding: 28px 22px 48px;
  }
  .family-story-prose {
    font-size: 18px;
    line-height: 1.8;
  }
  .family-story-prose h3 {
    font-size: 25px;
  }
}
@media (prefers-reduced-motion: reduce) {
  .family-story-scroll {
    scroll-behavior: auto;
  }
}
</style>
