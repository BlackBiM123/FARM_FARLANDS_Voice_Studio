<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount, onUnmounted, ref } from "vue";
import { BookOpen, X } from "lucide-vue-next";
import { brooksStoryVersions } from "../brooks-story-versions";
import type { Family } from "../../shared/family";
const props = defineProps<{ family: Family }>();
const emit = defineEmits<{ close: [] }>();
const dialog = ref<HTMLDialogElement | null>(null);
const activeTab = ref(0);
const hasVersions = computed(() => props.family.id === "fe4a77f0-47b5-49b5-9773-e0888d7af1c7");
const version = computed(() => brooksStoryVersions[activeTab.value - 1]);
function selectTab(index: number) {
  activeTab.value = index;
}
function tabKeys(event: KeyboardEvent, index: number) {
  let next = index;
  if (event.key === "ArrowRight") next = (index + 1) % 7;
  else if (event.key === "ArrowLeft") next = (index + 6) % 7;
  else if (event.key === "Home") next = 0;
  else if (event.key === "End") next = 6;
  else return;
  event.preventDefault();
  selectTab(next);
  document.getElementById(`story-tab-${next}`)?.focus();
}
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
        chapter: part.trim().match(/^Глава ([IVXLC]+)\./)?.[1],
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
function illustration(chapter?: string) {
  return props.family.storyIllustrations?.find(
    (image) => image.chapter === (chapter || "cover"),
  );
}
function jump(id: string) {
  document.getElementById(id)?.scrollIntoView({
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
      <div v-if="hasVersions" class="family-version-tabs" role="tablist" aria-label="Версии истории">
        <button v-for="index in 7" :key="index" :id="`story-tab-${index - 1}`" role="tab"
          :aria-selected="activeTab === index - 1" :tabindex="activeTab === index - 1 ? 0 : -1"
          :aria-controls="index === 1 ? 'story-original-panel' : 'story-version-panel'"
          @click="selectTab(index - 1)" @keydown="tabKeys($event, index - 1)">
          {{ index === 1 ? 'Исходная история' : `Семья ${index - 1}` }}
        </button>
      </div>
      <div v-if="hasVersions && version" :key="activeTab" id="story-version-panel" role="tabpanel"
        :aria-labelledby="`story-tab-${activeTab}`" tabindex="0" class="family-version-panel">
        <p class="version-step">Этап {{ activeTab }} из 6 · {{ version.impression }}</p>
        <h3>{{ version.title }}</h3>
        <p class="version-note">Рекомендуемый порядок раскрытия, а не даты событий. Игрок начинает без собственной версии. Семьи пока обозначены условно; их назначим после проработки жителей города.</p>
        <h4>История, в которую верит семья</h4><p>{{ version.story }}</p>
        <h4>Кто рассказывает</h4><p>{{ version.source }}</p>
        <h4>Почему игрок верит</h4><p>{{ version.evidence }}</p>
        <h4>Что выяснить в квесте</h4><p>{{ version.quest }}</p>
        <h4>Истина и искажения · для автора</h4><p>{{ version.truth }}</p>
        <h4>{{ activeTab === 6 ? 'Итог раскрытия' : 'Вопрос к следующему этапу' }}</h4><p>{{ version.next }}</p>
        <div class="version-navigation">
          <button @click="selectTab(activeTab - 1)">{{ activeTab === 1 ? 'К исходной истории' : 'Предыдущий этап' }}</button>
          <button v-if="activeTab < 6" @click="selectTab(activeTab + 1)">Следующий этап →</button>
        </div>
      </div>
      <div v-show="!hasVersions || activeTab === 0" id="story-original-panel"
        :role="hasVersions ? 'tabpanel' : undefined" :aria-labelledby="hasVersions ? 'story-tab-0' : undefined"
        class="family-story-layout"
        :class="{ 'is-empty': !chapters.length }"
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
              <figure
                v-if="illustration(section.chapter)"
                class="family-chapter-illustration"
              >
                <img
                  :src="illustration(section.chapter)!.url"
                  :alt="illustration(section.chapter)!.alt"
                  loading="lazy"
                  decoding="async"
                  width="1536"
                  height="1024"
                />
              </figure>
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
.family-version-tabs { display: flex; gap: 8px; overflow-x: auto; flex: 0 0 auto; padding: 12px 16px; border-bottom: 1px solid #ffffff14; }
.family-version-tabs button { flex: 0 0 auto; white-space: nowrap; }
.family-version-tabs [aria-selected="true"] { background: #60472a; color: #ffe0aa; border-color: #c6a66f; }
.family-version-panel { flex: 1; min-height: 0; overflow-y: auto; overscroll-behavior: contain; padding: 28px clamp(20px, 5vw, 68px) 48px; line-height: 1.8; }
.family-version-panel h3 { color: #efcf96; font-size: 27px; margin: 12px 0; }
.family-version-panel h4 { color: #debe89; margin: 28px 0 8px; font-size: 18px; }
.family-version-panel p { max-width: 780px; }
.version-step { color: #efcf96; font-size: 14px; }
.version-note { color: #b8b1a6; font-size: 13px; }
.version-navigation { display: flex; flex-wrap: wrap; gap: 12px; margin-top: 28px; }

.family-chapter-illustration {
  margin: 0 0 30px;
}
.family-chapter-illustration img {
  display: block;
  width: 100%;
  height: auto;
  aspect-ratio: 3 / 2;
  object-fit: contain;
  border: 1px solid #b58a4355;
  border-radius: 8px;
  image-rendering: pixelated;
  background: #24221f;
}
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
.family-story-dialog[open] {
  display: flex;
  flex-direction: column;
}
.family-story-header {
  flex: 0 0 auto;
  flex-direction: row;
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
  flex: 1;
  min-height: 0;
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
  font-weight: 400;
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
@media (max-width: 760px) {
  .family-story-dialog {
    width: 100%;
    height: 100dvh;
    margin: 0;
    border: 0;
    border-radius: 0;
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
