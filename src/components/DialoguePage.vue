<script setup lang="ts">
import { computed, ref, watch } from "vue";
import {
  Plus,
  GripVertical,
  Download,
  ArrowUp,
  ArrowDown,
  Trash2,
} from "lucide-vue-next";
import {
  dialogueLineSchema,
  lineTypes,
  lineTypeLabels,
  lineStatuses,
  lineStatusLabels,
  moveLine,
  type DialogueLine,
  type DialogueGroup,
  type Scenario,
} from "../../shared/content";
import type { NPC } from "../../shared/schema";
import type { Take } from "../storage";
const lines = defineModel<DialogueLine[]>({ required: true }),
  groups = defineModel<DialogueGroup[]>("groups", { required: true });
const props = defineProps<{
  npcs: NPC[];
  takes: Take[];
  urls: Record<string, string>;
  scenarios: Scenario[];
  busy: boolean;
  initialScenario?: string;
  initialNpc?: string;
}>();
const emit = defineEmits<{
  generate: [lineId: string, language: "ru" | "en"];
  upload: [lineId: string, language: "ru" | "en", file: File];
  download: [take: Take];
  openCharacter: [id: string];
  openScenario: [id: string];
}>();
const query = ref(""),
  npcFilter = ref(props.initialNpc || ""),
  typeFilter = ref(""),
  completion = ref(""),
  groupBy = ref<"type" | "group">("type"),
  page = ref(1),
  groupName = ref(""),
  detail = ref<string | null>(null),
  message = ref(""),
  armed = ref(""),
  dragged = ref(""),
  dropTarget = ref(""),
  scenarioFilter = ref(props.initialScenario || "");
watch(
  () => props.initialNpc,
  (id) => {
    npcFilter.value = id || "";
    page.value = 1;
  },
);
const countPerPage = 25;
const speaker = (id: string) => props.npcs.find((n) => n.id === id);
const take = (line: DialogueLine, lang: "ru" | "en") =>
  props.takes.find((t) => t.id === line[lang].takeId);
function stale(line: DialogueLine, lang: "ru" | "en") {
  const t = take(line, lang);
  return (
    !!t &&
    (t.text !== line[lang].text ||
      t.npcId !== line.npcId ||
      t.language !== lang)
  );
}
function ready(line: DialogueLine, lang: "ru" | "en") {
  return !!line[lang].text.trim() && !!take(line, lang) && !stale(line, lang);
}
watch(
  () => props.initialScenario,
  (s) => {
    scenarioFilter.value = s || "";
    page.value = 1;
  },
);
const filtered = computed(() =>
  lines.value.filter(
    (l) =>
      (!scenarioFilter.value || l.scenarioId === scenarioFilter.value) &&
      (!npcFilter.value || l.npcId === npcFilter.value) &&
      (!typeFilter.value || l.type === typeFilter.value) &&
      (!query.value ||
        (
          l.key +
          " " +
          l.ru.text +
          " " +
          l.en.text +
          " " +
          l.context +
          " " +
          speaker(l.npcId)?.name
        )
          .toLowerCase()
          .includes(query.value.toLowerCase())) &&
      (!completion.value ||
        (completion.value === "ru" && !ready(l, "ru")) ||
        (completion.value === "en" && !ready(l, "en")) ||
        (completion.value === "stale" && (stale(l, "ru") || stale(l, "en")))),
  ),
);
const pages = computed(() =>
  Math.max(1, Math.ceil(filtered.value.length / countPerPage)),
);
const ordered = computed(() =>
  groupBy.value === "type"
    ? lineTypes.flatMap((type) => filtered.value.filter((l) => l.type === type))
    : groups.value.flatMap((g) =>
        filtered.value.filter((l) => l.groupId === g.id),
      ),
);
const paged = computed(() =>
  ordered.value.slice(
    (page.value - 1) * countPerPage,
    page.value * countPerPage,
  ),
);
const sections = computed(() =>
  groupBy.value === "type"
    ? lineTypes
        .map((type) => ({
          id: type,
          title: lineTypeLabels[type],
          rows: paged.value.filter((l) => l.type === type),
        }))
        .filter((s) => s.rows.length)
    : groups.value.map((g) => ({
        id: g.id,
        title: g.name,
        rows: paged.value.filter((l) => l.groupId === g.id),
      })),
);
const stats = computed(() => ({
  ru: lines.value.filter((l) => ready(l, "ru")).length,
  en: lines.value.filter((l) => ready(l, "en")).length,
  stale: lines.value.filter((l) => stale(l, "ru") || stale(l, "en")).length,
}));
watch(
  [query, npcFilter, typeFilter, completion, groupBy, scenarioFilter],
  () => (page.value = 1),
);
watch(pages, (n) => {
  if (page.value > n) page.value = n;
});
function addGroup() {
  if (groups.value.length >= 100) {
    message.value = "Достигнут лимит групп";
    return;
  }
  const name = groupName.value.trim();
  if (!name) return;
  groups.value = [...groups.value, { id: crypto.randomUUID(), name }];
  groupName.value = "";
  groupBy.value = "group";
}
function addLine() {
  const n = speaker(npcFilter.value) || props.npcs[0];
  if (!n) return;
  if (lines.value.length >= 2000) {
    message.value = "Достигнут лимит реплик проекта";
    return;
  }
  if (!groups.value.length)
    groups.value = [{ id: crypto.randomUUID(), name: "Общие" }];
  const id = crypto.randomUUID();
  const line = dialogueLineSchema.parse({
    id,
    key: "line_" + id.replaceAll("-", "").slice(0, 12),
    npcId: n.id,
    groupId: groups.value[0]!.id,
    scenarioId: scenarioFilter.value || null,
    type: typeFilter.value || "greeting",
  });
  lines.value = [...lines.value, line];
  query.value = "";
  completion.value = "";
  page.value = 1;
  detail.value = id;
  message.value =
    "Реплика добавлена. Заполните RU и EN; изменения сохраняются автоматически.";
}
function duplicate(l: DialogueLine) {
  if (lines.value.length >= 2000) return;
  const id = crypto.randomUUID();
  lines.value = [
    ...lines.value,
    {
      ...JSON.parse(JSON.stringify(l)),
      id,
      key: "line_" + id.replaceAll("-", "").slice(0, 12),
    },
  ];
  message.value =
    "Создана копия. Готовые аудио переиспользуются, новые файлы не созданы.";
}
function remove(l: DialogueLine) {
  if (armed.value !== l.id) {
    armed.value = l.id;
    return;
  }
  lines.value = lines.value.filter((x) => x.id !== l.id);
  armed.value = "";
  message.value = "Реплика удалена; аудиодубли остались в библиотеке.";
}
function chooseSpeaker(l: DialogueLine) {
  l.ru.takeId = null;
  l.en.takeId = null;
}
function attach(l: DialogueLine, lang: "ru" | "en", e: Event) {
  const id = (e.target as HTMLSelectElement).value;
  const t = props.takes.find(
    (t) => t.id === id && t.npcId === l.npcId && t.language === lang,
  );
  l[lang].takeId = t?.id ?? null;
}
function files(l: DialogueLine, lang: "ru" | "en", e: Event) {
  const input = e.target as HTMLInputElement;
  if (input.files?.[0]) emit("upload", l.id, lang, input.files[0]);
  input.value = "";
}
function fileDrop(l: DialogueLine, lang: "ru" | "en", e: DragEvent) {
  dropTarget.value = "";
  if (props.busy) return;
  const file = e.dataTransfer?.files[0];
  if (file) emit("upload", l.id, lang, file);
}
function startDrag(l: DialogueLine, e: DragEvent) {
  dragged.value = l.id;
  e.dataTransfer?.setData("application/x-farlands-line", l.id);
  if (e.dataTransfer) e.dataTransfer.effectAllowed = "move";
}
function rowDrop(target: DialogueLine, e: DragEvent) {
  const id = e.dataTransfer?.getData("application/x-farlands-line");
  if (!id || props.busy) return;
  const l = lines.value.find((l) => l.id === id);
  if (!l) return;
  lines.value = moveLine(lines.value, id, target.groupId, target.id).map((x) =>
    x.id === id ? { ...x, type: target.type } : x,
  );
  dragged.value = "";
  dropTarget.value = "";
}
function groupDrop(groupId: string, e: DragEvent) {
  const id = e.dataTransfer?.getData("application/x-farlands-line");
  if (id && !props.busy) {
    lines.value = moveLine(lines.value, id, groupId);
    groupBy.value = "group";
  }
  dragged.value = "";
  dropTarget.value = "";
}
function sectionDrop(id: string, e: DragEvent) {
  const lineId = e.dataTransfer?.getData("application/x-farlands-line");
  if (!lineId || props.busy) return;
  if (groupBy.value === "group")
    lines.value = moveLine(lines.value, lineId, id);
  else
    lines.value = lines.value.map((l) =>
      l.id === lineId ? { ...l, type: id as DialogueLine["type"] } : l,
    );
  dragged.value = "";
  dropTarget.value = "";
}
function move(l: DialogueLine, step: number) {
  const siblings = ordered.value.filter((x) =>
    groupBy.value === "type" ? x.type === l.type : x.groupId === l.groupId,
  );
  const at = siblings.findIndex((x) => x.id === l.id),
    target = siblings[at + step];
  if (!target) return;
  const all = [...lines.value],
    a = all.findIndex((x) => x.id === l.id),
    b = all.findIndex((x) => x.id === target.id);
  [all[a], all[b]] = [all[b]!, all[a]!];
  lines.value = all;
}
function checkKey(l: DialogueLine, e: Event) {
  const value = (e.target as HTMLInputElement).value;
  if (
    !/^[a-z0-9_-]{1,80}$/.test(value) ||
    lines.value.some((x) => x.id !== l.id && x.key === value)
  ) {
    message.value =
      "Ключ: латинские буквы, цифры, _ и -. Он должен быть уникальным.";
    (e.target as HTMLInputElement).value = l.key;
    return;
  }
  l.key = value;
}
function pauseOthers(e: Event) {
  document.querySelectorAll("audio").forEach((a) => {
    if (a !== e.target) a.pause();
  });
}
</script>
<template>
  <section class="dialogue-page content-page">
    <div class="section-heading">
      <div>
        <span class="eyebrow">DIALOGUE WORKSHOP</span>
        <h2>Реплики персонажей</h2>
        <p class="hint">
          Одна строка — одна реплика на двух языках. Готовые дубли можно
          использовать повторно.
        </p>
      </div>
      <button class="primary" :disabled="!npcs.length || busy" @click="addLine">
        <Plus :size="17" />Добавить реплику
      </button>
    </div>
    <div class="content-stats">
      <span
        ><b>{{ lines.length }}</b> реплик</span
      ><span
        ><b>{{ stats.ru }}</b> RU с озвучкой</span
      ><span
        ><b>{{ stats.en }}</b> EN с озвучкой</span
      ><span :class="{ warning: stats.stale }"
        ><b>{{ stats.stale }}</b> требуют обновления</span
      >
    </div>
    <div class="content-toolbar panel">
      <label
        >Персонаж<select v-model="npcFilter">
          <option value="">Все персонажи</option>
          <option v-for="n in npcs" :key="n.id" :value="n.id">
            {{ n.name }}
          </option>
        </select></label
      >
      <label
        >Тип реплики<select v-model="typeFilter">
          <option value="">Все типы</option>
          <option v-for="type in lineTypes" :key="type" :value="type">
            {{ lineTypeLabels[type] }}
          </option>
        </select></label
      >
      <label
        >Группировать<select v-model="groupBy">
          <option value="type">По типу</option>
          <option value="group">По своей группе</option>
        </select></label
      >
      <label
        >Готовность аудио<select v-model="completion">
          <option value="">Все реплики</option>
          <option value="ru">Нет готового RU</option>
          <option value="en">Нет готового EN</option>
          <option value="stale">Текст изменился</option>
        </select></label
      >
      <label
        >Сценарий реплик<select v-model="scenarioFilter">
          <option value="">Все сценарии</option>
          <option v-for="s in scenarios" :key="s.id" :value="s.id">
            {{ s.title }}
          </option>
        </select></label
      >
      <label class="content-search"
        >Поиск<input
          v-model="query"
          placeholder="Текст, ключ или имя персонажа"
      /></label>
    </div>
    <details class="panel group-manager">
      <summary>Свои группы · {{ groups.length }}</summary>
      <div class="group-create">
        <label
          >Название новой группы<input
            v-model="groupName"
            maxlength="80"
            placeholder="Например: встреча у мельницы"
            @keydown.enter.prevent="addGroup" /></label
        ><button :disabled="!groupName.trim() || busy" @click="addGroup">
          Добавить группу
        </button>
      </div>
      <div v-for="(g, i) in groups" :key="g.id" class="group-edit">
        <input
          v-model="g.name"
          aria-label="Название группы"
          maxlength="80"
          @blur="g.name = g.name.trim() || 'Без названия'"
        /><button
          :disabled="i === 0 || busy"
          aria-label="Поднять группу"
          @click="groups.splice(i - 1, 2, g, groups[i - 1]!)"
        >
          <ArrowUp :size="15" /></button
        ><button
          :disabled="i === groups.length - 1 || busy"
          aria-label="Опустить группу"
          @click="groups.splice(i, 2, groups[i + 1]!, g)"
        >
          <ArrowDown :size="15" /></button
        ><button
          :disabled="busy || lines.some((l) => l.groupId === g.id)"
          aria-label="Удалить пустую группу"
          @click="groups = groups.filter((x) => x.id !== g.id)"
        >
          <Trash2 :size="15" />
        </button>
      </div>
      <p class="hint">
        Удалить можно только пустую группу. Реплики переносятся выбором группы в
        строке или перетаскиванием за ⠿.
      </p>
    </details>
    <div v-if="groups.length > 1" class="group-dropbar panel">
      <small>Перенести в группу:</small>
      <div
        v-for="g in groups"
        :key="g.id"
        class="group-drop-target"
        :class="{ 'drop-active': dropTarget === g.id }"
        @dragover.prevent="dropTarget = g.id"
        @dragleave="dropTarget = ''"
        @drop.prevent="groupDrop(g.id, $event)"
      >
        {{ g.name }}
      </div>
    </div>
    <p v-if="message" class="content-message" role="status">{{ message }}</p>
    <div v-if="!lines.length" class="panel content-empty">
      <h3>Библиотека пока пуста</h3>
      <p>
        Добавьте персонажа и первую реплику. Озвучку можно сгенерировать,
        загрузить WAV или выбрать из существующих дублей.
      </p>
    </div>
    <div v-else-if="!filtered.length" class="panel content-empty">
      По этим фильтрам реплик нет.
    </div>
    <div
      v-for="section in sections"
      :key="section.id"
      class="dialogue-section panel"
      :class="{ 'drop-active': dropTarget === section.id }"
      @dragover.prevent="dropTarget = section.id"
      @dragleave="dropTarget = ''"
      @drop.prevent="sectionDrop(section.id, $event)"
    >
      <div class="dialogue-section-heading">
        <h3>{{ section.title }}</h3>
        <small
          >{{ section.rows.length }} на странице · перетащите сюда
          реплику</small
        >
      </div>
      <div class="dialogue-table-scroll">
        <table class="dialogue-table">
          <thead>
            <tr>
              <th>Персонаж и контекст</th>
              <th>Русский · RU</th>
              <th>English · EN</th>
              <th>Организация</th>
            </tr>
          </thead>
          <tbody>
            <template v-for="l in section.rows" :key="l.id"
              ><tr
                :class="{ 'line-dragging': dragged === l.id }"
                @dragover.prevent.stop
                @drop.prevent.stop="rowDrop(l, $event)"
              >
                <td class="line-meta">
                  <div class="line-speaker">
                    <button
                      class="drag-handle"
                      :draggable="!busy"
                      aria-label="Перетащить реплику"
                      @dragstart="startDrag(l, $event)"
                      @dragend="
                        dragged = '';
                        dropTarget = '';
                      "
                    >
                      <GripVertical :size="18" /></button
                    ><img
                      v-if="speaker(l.npcId)?.photo"
                      :src="speaker(l.npcId)!.photo"
                      :alt="speaker(l.npcId)!.name"
                    /><button
                      class="text-button"
                      @click="emit('openCharacter', l.npcId)"
                    >
                      {{ speaker(l.npcId)?.name }}
                    </button>
                  </div>
                  <label
                    >Говорящий<select
                      v-model="l.npcId"
                      :disabled="busy"
                      @change="chooseSpeaker(l)"
                    >
                      <option v-for="n in npcs" :key="n.id" :value="n.id">
                        {{ n.name }}
                      </option>
                    </select></label
                  ><label
                    >Ключ реплики<input
                      :value="l.key"
                      maxlength="80"
                      @change="checkKey(l, $event)" /></label
                  ><label
                    >Статус текста<select v-model="l.status">
                      <option
                        v-for="status in lineStatuses"
                        :key="status"
                        :value="status"
                      >
                        {{ lineStatusLabels[status] }}
                      </option>
                    </select></label
                  ><button
                    class="text-button"
                    :aria-expanded="detail === l.id"
                    @click="detail = detail === l.id ? null : l.id"
                  >
                    {{ detail === l.id ? "Скрыть" : "Контекст и подача" }}
                  </button>
                </td>
                <td
                  v-for="lang in ['ru', 'en'] as const"
                  :key="lang"
                  :class="[
                    'line-' + lang,
                    { 'drop-active': dropTarget === l.id + lang },
                  ]"
                  class="line-locale"
                  @dragover.prevent.stop="dropTarget = l.id + lang"
                  @drop.prevent.stop="fileDrop(l, lang, $event)"
                >
                  <label :for="l.id + '-' + lang" class="sr-only"
                    >{{ lang.toUpperCase() }} — {{ l.key }}</label
                  ><textarea
                    :id="l.id + '-' + lang"
                    v-model="l[lang].text"
                    maxlength="600"
                    rows="4"
                    :placeholder="
                      lang === 'ru'
                        ? 'Реплика на русском…'
                        : 'Write the English line…'
                    "
                  />
                  <div class="locale-heading">
                    <small>{{ l[lang].text.length }}/600</small
                    ><span v-if="ready(l, lang)" class="state-pill ready"
                      >Озвучено</span
                    ><span v-else-if="stale(l, lang)" class="state-pill warning"
                      >Текст изменился</span
                    ><span v-else class="state-pill">Нет озвучки</span>
                  </div>
                  <audio
                    v-if="take(l, lang)"
                    controls
                    preload="none"
                    :src="urls[take(l, lang)!.id]"
                    @play="pauseOthers"
                  />
                  <p v-if="stale(l, lang)" class="audio-warning">
                    Запись отличается от текста. Выберите подходящий дубль или
                    создайте новый.
                  </p>
                  <p
                    v-if="l[lang].takeId && !take(l, lang)"
                    class="audio-warning"
                  >
                    Привязанный дубль не найден.
                  </p>
                  <div class="locale-actions">
                    <button
                      :disabled="busy || !l[lang].text.trim()"
                      @click="emit('generate', l.id, lang)"
                    >
                      Озвучить {{ lang.toUpperCase() }}</button
                    ><label class="upload-audio" :class="{ disabled: busy }"
                      >Загрузить WAV<input
                        type="file"
                        accept=".wav,audio/wav"
                        :disabled="busy"
                        :aria-label="
                          'Загрузить WAV ' + lang.toUpperCase() + ' — ' + l.key
                        "
                        @change="files(l, lang, $event)" /></label
                    ><button
                      v-if="take(l, lang)"
                      class="icon"
                      :aria-label="'Скачать ' + lang.toUpperCase()"
                      @click="emit('download', take(l, lang)!)"
                    >
                      <Download :size="15" />
                    </button>
                  </div>
                  <label
                    >Выбранный дубль<select
                      :value="l[lang].takeId || ''"
                      :disabled="busy"
                      @change="attach(l, lang, $event)"
                    >
                      <option value="">Без аудио</option>
                      <option
                        v-for="t in takes.filter(
                          (t) => t.npcId === l.npcId && t.language === lang,
                        )"
                        :key="t.id"
                        :value="t.id"
                      >
                        {{ t.text.slice(0, 55) || "Загруженный WAV" }} ·
                        {{ new Date(t.createdAt).toLocaleDateString("ru-RU") }}
                      </option>
                    </select></label
                  ><small class="hint"
                    >Можно перетащить WAV в эту ячейку.</small
                  >
                </td>
                <td class="line-organization">
                  <label
                    >Тип<select v-model="l.type">
                      <option
                        v-for="type in lineTypes"
                        :key="type"
                        :value="type"
                      >
                        {{ lineTypeLabels[type] }}
                      </option>
                    </select></label
                  ><label
                    >Группа<select v-model="l.groupId">
                      <option v-for="g in groups" :key="g.id" :value="g.id">
                        {{ g.name }}
                      </option>
                    </select></label
                  >
                  <div class="line-move">
                    <button
                      :disabled="busy"
                      aria-label="Поднять реплику"
                      @click="move(l, -1)"
                    >
                      <ArrowUp :size="15" /></button
                    ><button
                      :disabled="busy"
                      aria-label="Опустить реплику"
                      @click="move(l, 1)"
                    >
                      <ArrowDown :size="15" />
                    </button>
                  </div>
                  <button :disabled="busy" @click="duplicate(l)">
                    Копировать</button
                  ><button :disabled="busy" class="danger" @click="remove(l)">
                    {{
                      armed === l.id ? "Подтвердить удаление" : "Удалить строку"
                    }}
                  </button>
                </td>
              </tr>
              <tr v-if="detail === l.id" class="line-details">
                <td colspan="4">
                  <div class="line-detail-grid">
                    <label
                      >Кому адресовано<select v-model="l.recipientId">
                        <option :value="null">Игроку / без адресата</option>
                        <option
                          v-for="n in npcs.filter((n) => n.id !== l.npcId)"
                          :key="n.id"
                          :value="n.id"
                        >
                          {{ n.name }}
                        </option>
                      </select></label
                    ><label
                      >Сценарий<select v-model="l.scenarioId">
                        <option :value="null">Без сценария</option>
                        <option
                          v-for="s in scenarios"
                          :key="s.id"
                          :value="s.id"
                        >
                          {{ s.title }}
                        </option>
                      </select></label
                    ><label
                      >Контекст сцены<textarea
                        v-model="l.context"
                        maxlength="1000"
                        rows="2"
                        placeholder="Где и почему звучит реплика"
                      /></label
                    ><label
                      >Условия выбора<textarea
                        v-model="l.conditions"
                        maxlength="1000"
                        rows="2"
                        placeholder="Например: первый разговор, дождь, доверие выше 50"
                      /></label
                    ><label
                      >Эмоция<input
                        v-model="l.emotion"
                        maxlength="100"
                        placeholder="По умолчанию — из настроек персонажа" /></label
                    ><label
                      >Указания для этой реплики<textarea
                        v-model="l.direction"
                        maxlength="1000"
                        rows="2"
                        placeholder="Паузы, интонация, особенности сцены"
                      />
                    </label>
                  </div>
                  <button
                    v-if="l.scenarioId"
                    class="text-button"
                    @click="emit('openScenario', l.scenarioId)"
                  >
                    Открыть связанный сценарий →
                  </button>
                </td>
              </tr></template
            >
          </tbody>
        </table>
      </div>
    </div>
    <div v-if="filtered.length" class="content-pagination">
      <button :disabled="page <= 1" @click="page--">← Назад</button
      ><span
        >Страница {{ page }} / {{ pages }} · {{ filtered.length }} реплик</span
      ><button :disabled="page >= pages" @click="page++">Далее →</button>
    </div>
    <p class="hint content-footnote">
      Генерация запускается по одной реплике и расходует квоту Gemini. RU и EN
      озвучиваются отдельно. Условия выбора — авторские заметки для реализации в
      игре.
    </p>
  </section>
</template>
