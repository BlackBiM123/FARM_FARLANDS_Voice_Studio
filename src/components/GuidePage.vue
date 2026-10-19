<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from "vue";
import {
  BookOpen,
  Search,
  ChevronLeft,
  ChevronRight,
  Printer,
  Download,
  X,
} from "lucide-vue-next";
import {
  guideChapters,
  guideSectionText,
  normalizeGuideText,
  searchGuide,
} from "../guide";
import { route } from "../navigation";
import contractSource from "../../docs/architecture/mechanics-contract.md?raw";
const query = ref(""),
  article = ref<HTMLElement>(),
  tocOpen = ref(window.innerWidth >= 960);
const params = computed(
  () => new URLSearchParams(route.value.split("?")[1] ?? ""),
);
const requested = computed(() => params.value.get("chapter") ?? "start");
const index = computed(() =>
  guideChapters.findIndex((c) => c.id === requested.value),
);
const chapter = computed(() => guideChapters[Math.max(0, index.value)]!);
const sectionId = computed(() => params.value.get("section"));
const searching = computed(() => !!query.value.trim());
const results = computed(() => searchGuide(query.value));
const originalTitle = document.title;
function link(id: string, section?: string) {
  return (
    "/guide?chapter=" +
    encodeURIComponent(id) +
    (section ? "&section=" + encodeURIComponent(section) : "")
  );
}
function minutes(id: string) {
  const c = guideChapters.find((c) => c.id === id)!;
  return Math.max(
    1,
    Math.ceil(
      c.sections.map(guideSectionText).join(" ").split(/\s+/).length / 180,
    ),
  );
}
function excerpt(text: string) {
  const first = normalizeGuideText(query.value.trim()).split(/\s+/)[0] ?? "",
    at = Math.max(0, normalizeGuideText(text).indexOf(first) - 50);
  return (
    (at ? "…" : "") +
    text.slice(at, at + 210) +
    (at + 210 < text.length ? "…" : "")
  );
}
async function scrollToContent() {
  await nextTick();
  const target = sectionId.value
    ? document.getElementById("guide-section-" + sectionId.value)
    : undefined;
  (target ?? article.value)?.scrollIntoView({ block: "start" });
}
function printChapter() {
  window.print();
}
function downloadContract() {
  const url = URL.createObjectURL(
      new Blob([contractSource], { type: "text/markdown;charset=utf-8" }),
    ),
    a = document.createElement("a");
  a.href = url;
  a.download = "farm-farlands-mechanics-contract.md";
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
watch(
  () => route.value,
  () => {
    query.value = "";
    document.title = chapter.value.title + " — Руководство FARM & FARLANDS";
    void scrollToContent();
  },
);
const media = window.matchMedia("(min-width: 960px)");
function resized(e: MediaQueryListEvent) {
  tocOpen.value = e.matches;
}
onMounted(() => {
  document.title = chapter.value.title + " — Руководство FARM & FARLANDS";
  media.addEventListener("change", resized);
  if (sectionId.value) void scrollToContent();
});
onUnmounted(() => {
  media.removeEventListener("change", resized);
  document.title = originalTitle;
});
</script>

<template>
  <section class="guide-page" aria-label="Руководство по Studio">
    <div class="panel guide-heading">
      <div>
        <span class="eyebrow">FARM & FARLANDS / СПРАВОЧНИК</span>
        <h2>Руководство по Studio</h2>
        <p>
          От первого персонажа до подключения механики. Пошагово, с примерами и
          объяснением ограничений.
        </p>
      </div>
      <span class="guide-count"
        ><BookOpen :size="18" />{{ guideChapters.length }} глав</span
      >
    </div>
    <div class="guide-layout">
      <aside class="guide-sidebar">
        <label class="guide-search"
          ><Search :size="17" /><input
            v-model="query"
            type="search"
            aria-label="Поиск по руководству"
            placeholder="Что хотите найти?" /><button
            v-if="query"
            aria-label="Очистить поиск по руководству"
            @click="query = ''"
          >
            <X :size="15" /></button
        ></label>
        <p class="guide-search-hint">
          Например: сохранение, портрет, квота, переменная
        </p>
        <details
          class="panel guide-contents"
          :open="tocOpen"
          @toggle="tocOpen = ($event.target as HTMLDetailsElement).open"
        >
          <summary>Оглавление</summary>
          <div role="navigation" aria-label="Главы руководства">
            <a
              v-for="(c, i) in guideChapters"
              :key="c.id"
              :href="link(c.id)"
              :aria-current="index === i && !searching ? 'page' : undefined"
              @click="query = ''"
              ><span>{{ String(i + 1).padStart(2, "0") }}</span
              ><strong>{{ c.title }}</strong></a
            >
          </div>
        </details>
        <p class="guide-sidebar-note">
          Руководство описывает текущие возможности. Экспериментальные правила
          отдельно отмечены в тексте.
        </p>
      </aside>
      <main ref="article" class="panel guide-article" id="guide-content">
        <template v-if="searching">
          <span class="eyebrow">ПОИСК ПО ВСЕМ ГЛАВАМ</span>
          <h2>Результаты поиска</h2>
          <p role="status">Найдено пунктов: {{ results.length }}</p>
          <div v-if="!results.length" class="guide-empty">
            <p>
              По этому запросу ничего не найдено. Попробуйте короче: «снимок»,
              «модуль», «голос».
            </p>
            <button @click="query = ''">Вернуться к главе</button>
          </div>
          <a
            v-for="r in results"
            :key="r.chapter.id + ':' + r.section.id"
            class="guide-result"
            :href="link(r.chapter.id, r.section.id)"
            @click="query = ''"
            ><small>{{ r.chapter.title }}</small>
            <h3>{{ r.section.title }}</h3>
            <p>{{ excerpt(r.text) }}</p></a
          >
        </template>
        <template v-else-if="index < 0"
          ><h2>Глава не найдена</h2>
          <p>
            Возможно, ссылка устарела. Выберите главу в оглавлении или начните с
            первой.
          </p>
          <a :href="link('start')">Открыть начало руководства</a></template
        >
        <template v-else>
          <div class="guide-chapter-meta">
            <span class="eyebrow"
              >ГЛАВА {{ index + 1 }} ИЗ {{ guideChapters.length }}</span
            ><span>≈ {{ minutes(chapter.id) }} мин чтения</span
            ><button @click="printChapter">
              <Printer :size="15" />Печать главы
            </button>
          </div>
          <h2>{{ chapter.title }}</h2>
          <p class="guide-lead">{{ chapter.summary }}</p>
          <div class="guide-local-toc" aria-label="Пункты этой главы">
            <a
              v-for="(s, i) in chapter.sections"
              :key="s.id"
              :href="link(chapter.id, s.id)"
              >{{ index + 1 }}.{{ i + 1 }} {{ s.title }}</a
            >
          </div>
          <section
            v-for="(s, i) in chapter.sections"
            :id="'guide-section-' + s.id"
            :key="chapter.id + ':' + s.id"
            :class="['guide-section', { 'guide-target': sectionId === s.id }]"
          >
            <div class="guide-section-title">
              <span>{{ index + 1 }}.{{ i + 1 }}</span>
              <h3>{{ s.title }}</h3>
              <a
                :href="link(chapter.id, s.id)"
                :aria-label="'Ссылка на пункт ' + s.title"
                title="Постоянная ссылка на этот пункт"
                >§</a
              >
            </div>
            <p v-for="p in s.paragraphs" :key="p">{{ p }}</p>
            <ol v-if="s.steps" class="guide-steps">
              <li v-for="(step, k) in s.steps" :key="step">
                <span>{{ k + 1 }}</span>
                <p>{{ step }}</p>
              </li>
            </ol>
            <ul v-if="s.bullets">
              <li v-for="b in s.bullets" :key="b">{{ b }}</li>
            </ul>
            <div v-if="s.table" class="guide-table">
              <table>
                <thead>
                  <tr>
                    <th v-for="h in s.table.headers" :key="h">{{ h }}</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="(row, n) in s.table.rows" :key="n">
                    <td v-for="(cell, k) in row" :key="k">{{ cell }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <aside v-if="s.note" class="guide-note">
              <strong>{{ s.note.title }}</strong>
              <p>{{ s.note.text }}</p>
            </aside>
            <div v-if="s.links" class="guide-links">
              <a v-for="a in s.links" :key="a.href" :href="a.href"
                >{{ a.label }} <ChevronRight :size="14"
              /></a>
            </div>
            <template v-if="chapter.id === 'contract' && s.id === 'source'"
              ><button
                class="guide-contract-download"
                @click="downloadContract"
              >
                <Download :size="15" />Скачать контракт .md
              </button>
              <details class="guide-source">
                <summary>
                  Показать полный технический текст контракта v1
                </summary>
                <pre>{{ contractSource }}</pre>
              </details></template
            >
          </section>
          <div class="guide-page-turn">
            <a v-if="index > 0" :href="link(guideChapters[index - 1]!.id)"
              ><ChevronLeft :size="18" /><span
                ><small>Предыдущая глава</small
                >{{ guideChapters[index - 1]!.title }}</span
              ></a
            ><a
              v-if="index < guideChapters.length - 1"
              :href="link(guideChapters[index + 1]!.id)"
              class="guide-next"
              ><span
                ><small>Следующая глава</small
                >{{ guideChapters[index + 1]!.title }}</span
              ><ChevronRight :size="18"
            /></a>
          </div>
        </template>
      </main>
    </div>
  </section>
</template>

<style scoped>
.guide-page {
  max-width: 1440px;
  margin: 0 auto 32px;
  min-width: 0;
}
.guide-heading {
  display: flex;
  justify-content: space-between;
  gap: 24px;
  align-items: center;
  padding: 24px;
  margin-bottom: 20px;
}
.guide-heading h2 {
  font-size: 1.9rem;
  margin: 9px 0;
}
.guide-heading p {
  color: #aaa99f;
  line-height: 1.6;
  margin: 0;
  max-width: 760px;
}
.guide-count {
  display: flex;
  align-items: center;
  gap: 9px;
  white-space: nowrap;
  color: #dfb666;
}
.guide-layout {
  display: grid;
  grid-template-columns: 285px minmax(0, 1fr);
  gap: 22px;
  align-items: start;
}
.guide-sidebar {
  position: sticky;
  top: 16px;
  min-width: 0;
}
.guide-search {
  display: flex;
  align-items: center;
  gap: 8px;
  background: #15181e;
  border: 1px solid #42434a;
  border-radius: 8px;
  padding: 10px 12px;
}
.guide-search input {
  width: 100%;
  min-width: 0;
  background: none;
  border: none;
  color: inherit;
  padding: 0;
  font-size: 0.9rem;
  outline: none;
}
.guide-search:focus-within {
  border-color: #dfb666;
}
.guide-search button {
  padding: 3px;
  background: none;
  border: 0;
}
.guide-search-hint,
.guide-sidebar-note {
  font-size: 0.75rem;
  line-height: 1.55;
  color: #99988f;
  margin: 10px 3px 14px;
}
.guide-contents {
  padding: 14px 10px;
}
.guide-contents summary {
  padding: 0 6px 10px;
  cursor: pointer;
  font-weight: 650;
}
.guide-contents [role="navigation"] {
  max-height: 65vh;
  overflow-y: auto;
}
.guide-contents a {
  display: grid;
  grid-template-columns: 25px minmax(0, 1fr);
  gap: 8px;
  padding: 10px 8px;
  border-left: 3px solid transparent;
  text-decoration: none;
  border-radius: 3px;
  color: #c1beb5;
  line-height: 1.4;
}
.guide-contents a:hover {
  background: #ffffff06;
}
.guide-contents a[aria-current="page"] {
  background: #d4a54b0e;
  border-left-color: #d4a54b;
  color: #edc778;
}
.guide-contents a span {
  color: #969080;
  font-family: monospace;
  padding-top: 2px;
  font-size: 0.75rem;
}
.guide-contents a strong {
  font-size: 0.83rem;
  font-weight: 500;
}
.guide-article {
  padding: 30px 34px;
  min-width: 0;
  scroll-margin-top: 20px;
}
.guide-article > h2 {
  font-size: 1.85rem;
  line-height: 1.25;
  margin: 16px 0;
}
.guide-chapter-meta {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  color: #999;
  font-size: 0.75rem;
}
.guide-chapter-meta button {
  margin-left: auto;
  font-size: 0.75rem;
  padding: 7px 10px;
}
.guide-lead {
  font-size: 1.02rem;
  color: #b6b2a7;
  line-height: 1.7;
  margin: 12px 0 22px;
}
.guide-local-toc {
  display: flex;
  flex-direction: column;
  align-items: start;
  gap: 9px;
  padding: 16px 18px;
  border: 1px solid #ffffff10;
  background: #ffffff03;
  border-radius: 8px;
  margin-bottom: 28px;
  font-size: 0.85rem;
}
.guide-article a {
  color: #e1b965;
  text-underline-offset: 4px;
}
.guide-section {
  border-top: 1px solid #ffffff10;
  padding-top: 26px;
  margin-top: 28px;
  scroll-margin-top: 20px;
  min-width: 0;
}
.guide-target {
  border-top-color: #d5ab57;
}
.guide-section-title {
  display: flex;
  align-items: baseline;
  gap: 10px;
  margin-bottom: 15px;
}
.guide-section-title > span {
  font-family: monospace;
  font-size: 0.85rem;
  color: #c7a86b;
  flex-shrink: 0;
}
.guide-section-title h3 {
  font-size: 1.1rem;
  line-height: 1.45;
  margin: 0;
}
.guide-section-title a {
  margin-left: auto;
  text-decoration: none;
  font-size: 1.2rem;
  padding: 0 5px;
}
.guide-section > p,
.guide-section li {
  line-height: 1.8;
  font-size: 0.95rem;
  overflow-wrap: anywhere;
}
.guide-section > p {
  margin: 12px 0 16px;
  color: #d0cdc4;
}
.guide-steps {
  padding: 0;
  margin: 18px 0;
  list-style: none;
  display: grid;
  gap: 10px;
}
.guide-steps li {
  display: grid;
  grid-template-columns: 28px minmax(0, 1fr);
  gap: 12px;
  align-items: start;
  padding: 12px 14px;
  background: #ffffff03;
  border: 1px solid #ffffff0c;
  border-radius: 7px;
}
.guide-steps li > span {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 26px;
  width: 26px;
  border-radius: 50%;
  color: #e3bd74;
  background: #d4a54b12;
  font-size: 0.8rem;
  font-weight: 650;
}
.guide-steps li > p {
  margin: 0;
  line-height: 1.7;
}
.guide-table {
  max-width: 100%;
  overflow-x: auto;
  margin: 20px 0;
}
.guide-table table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.88rem;
  min-width: 430px;
}
.guide-table th,
.guide-table td {
  padding: 13px 14px;
  text-align: left;
  vertical-align: top;
  border-bottom: 1px solid #ffffff12;
  line-height: 1.65;
}
.guide-table th {
  color: #dcb66f;
  background: #ffffff04;
  font-size: 0.8rem;
}
.guide-table td:first-child {
  font-weight: 600;
  color: #dfd9cb;
}
.guide-note {
  padding: 15px 18px;
  margin: 20px 0;
  border-left: 3px solid #d3aa59;
  background: #d3aa5908;
  border-radius: 0 6px 6px 0;
}
.guide-note strong {
  color: #e0be7a;
  font-size: 0.9rem;
}
.guide-note p {
  margin: 8px 0 0;
  line-height: 1.75;
  font-size: 0.9rem;
  color: #c7c0af;
}
.guide-links {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
  margin: 18px 0;
}
.guide-links a {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 8px 11px;
  border: 1px solid #b3915035;
  border-radius: 5px;
  text-decoration: none;
  font-size: 0.82rem;
}
.guide-page-turn {
  display: flex;
  justify-content: space-between;
  gap: 18px;
  border-top: 1px solid #ffffff15;
  margin-top: 36px;
  padding-top: 22px;
}
.guide-page-turn a {
  display: flex;
  gap: 8px;
  align-items: center;
  max-width: 48%;
  font-size: 0.85rem;
  text-decoration: none;
  line-height: 1.5;
}
.guide-page-turn small {
  display: block;
  font-size: 0.7rem;
  color: #929087;
  margin-bottom: 3px;
}
.guide-page-turn .guide-next {
  margin-left: auto;
  text-align: right;
}
.guide-source {
  margin-top: 18px;
  border: 1px solid #ffffff18;
  border-radius: 7px;
  padding: 14px;
}
.guide-source summary {
  cursor: pointer;
  font-size: 0.9rem;
}
.guide-source pre {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  font: 0.8rem/1.8 monospace;
  margin: 16px 0 0;
  color: #bcb7aa;
}
.guide-contract-download {
  font-size: 0.85rem;
  margin: 8px 0;
}
.guide-result {
  display: block;
  border: 1px solid #ffffff15;
  border-radius: 8px;
  margin: 14px 0;
  padding: 16px 18px;
  text-decoration: none;
}
.guide-result:hover {
  background: #ffffff04;
}
.guide-result small {
  color: #979388;
  font-size: 0.75rem;
}
.guide-result h3 {
  font-size: 1rem;
  line-height: 1.5;
  margin: 7px 0;
}
.guide-result p {
  color: #b6b2a6;
  font-size: 0.87rem;
  line-height: 1.7;
  margin: 8px 0 0;
  overflow-wrap: anywhere;
}
.guide-empty {
  padding: 18px 0;
  line-height: 1.7;
}
.guide-search input::-webkit-search-cancel-button {
  display: none;
}
@media (max-width: 959px) {
  .guide-layout {
    grid-template-columns: 1fr;
    gap: 16px;
  }
  .guide-sidebar {
    position: static;
  }
  .guide-sidebar-note {
    display: none;
  }
  .guide-contents [role="navigation"] {
    max-height: 350px;
  }
  .guide-heading {
    padding: 18px;
    align-items: flex-start;
  }
  .guide-heading h2 {
    font-size: 1.5rem;
  }
  .guide-count {
    font-size: 0.75rem;
  }
  .guide-article {
    padding: 22px;
  }
  .guide-article > h2 {
    font-size: 1.5rem;
  }
}
@media (max-width: 500px) {
  .guide-heading {
    gap: 12px;
    flex-direction: column;
  }
  .guide-article {
    padding: 18px 14px;
  }
  .guide-section-title {
    gap: 8px;
  }
  .guide-section-title h3 {
    font-size: 1rem;
  }
  .guide-section > p,
  .guide-section li {
    font-size: 0.9rem;
  }
  .guide-steps li {
    padding: 10px;
    gap: 9px;
    grid-template-columns: 24px minmax(0, 1fr);
  }
  .guide-steps li > span {
    width: 24px;
    height: 24px;
  }
  .guide-chapter-meta button {
    margin-left: 0;
  }
  .guide-local-toc {
    padding: 14px;
  }
  .guide-note {
    padding: 12px 14px;
  }
  .guide-page-turn {
    gap: 12px;
  }
  .guide-table td,
  .guide-table th {
    padding: 10px 12px;
  }
}
@media print {
  .guide-heading,
  .guide-sidebar,
  .guide-local-toc,
  .guide-chapter-meta button,
  .guide-page-turn,
  .guide-section-title > a,
  .guide-contract-download {
    display: none;
  }
  .guide-layout {
    display: block;
  }
  .guide-article {
    padding: 0;
    border: 0;
    background: white;
    color: black;
  }
  .guide-article p,
  .guide-article td,
  .guide-article th,
  .guide-article h2,
  .guide-article h3,
  .guide-article a,
  .guide-note strong,
  .guide-note p {
    color: black;
  }
  .guide-section {
    break-inside: auto;
  }
  .guide-note,
  .guide-steps li {
    break-inside: avoid;
  }
  .guide-table {
    overflow: visible;
  }
  .guide-article a {
    text-decoration: none;
  }
  :global(body:has(.guide-page) header),
  :global(body:has(.guide-page) .studio > nav),
  :global(body:has(.guide-page) .cloud-status),
  :global(body:has(.guide-page) footer) {
    display: none;
  }
  :global(body:has(.guide-page)) {
    background: white;
    color: black;
  }
}
</style>
