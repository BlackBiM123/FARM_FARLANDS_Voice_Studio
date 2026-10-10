<script setup lang="ts">
import { computed, ref, watch } from "vue";
import {
  familySchema,
  familyError,
  kinship,
  type Family,
} from "../../shared/family";
import type { NPC } from "../../shared/schema";
const props = defineProps<{ modelValue: Family[]; npcs: NPC[] }>();
const emit = defineEmits<{
  "update:modelValue": [Family[]];
  "open-character": [string];
}>();
const selected = ref(""),
  draft = ref<Family | null>(null),
  error = ref(""),
  from = ref(""),
  to = ref(""),
  kind = ref<Family["links"][number]["kind"]>("parent"),
  pickA = ref(""),
  pickB = ref(""),
  zoom = ref(1);
const labels = {
  parent: "Родитель → ребёнок",
  adoptive: "Приёмный родитель → ребёнок",
  spouse: "Супруги",
  partner: "Партнёры",
  former: "Бывшие партнёры",
};
let original = "";
const linkedFamilyId = window.location.hash.split("/")[2];
if (linkedFamilyId) {
  const family = props.modelValue.find((f) => f.id === linkedFamilyId);
  if (family) open(family);
}

function open(f?: Family) {
  draft.value = f
    ? structuredClone(JSON.parse(JSON.stringify(f)))
    : {
        id: crypto.randomUUID(),
        name: "",
        description: "",
        home: "",
        members: [],
        links: [],
      };
  selected.value = f?.id || "";
  original = JSON.stringify(f || null);
  error.value = "";
  pickA.value = "";
  pickB.value = "";
}
watch(
  () => props.modelValue,
  () => {
    if (!selected.value) return;
    const saved = props.modelValue.find((f) => f.id === selected.value);
    if (saved && JSON.stringify(saved) !== original)
      error.value =
        "Семья изменилась на другом устройстве. Откройте её заново перед сохранением.";
  },
  { deep: true },
);
function save() {
  if (
    selected.value &&
    JSON.stringify(props.modelValue.find((f) => f.id === selected.value)) !==
      original
  ) {
    error.value = "Откройте обновлённую семью перед сохранением";
    return;
  }
  const parsed = familySchema.safeParse(draft.value);
  if (!parsed.success) {
    error.value = "Укажите название семьи и проверьте поля";
    return;
  }
  error.value = familyError(parsed.data);
  if (error.value) return;
  const list = props.modelValue.filter((f) => f.id !== parsed.data.id);
  list.push(parsed.data);
  original = JSON.stringify(parsed.data);
  selected.value = parsed.data.id;
  emit("update:modelValue", list);
}
function member(id: string, event: Event) {
  if (!draft.value) return;
  if ((event.target as HTMLInputElement).checked) draft.value.members.push(id);
  else {
    draft.value.members = draft.value.members.filter((m) => m !== id);
    draft.value.links = draft.value.links.filter(
      (l) => l.from !== id && l.to !== id,
    );
  }
}
function addLink() {
  if (!draft.value) return;
  const l = {
    id: crypto.randomUUID(),
    from: from.value,
    to: to.value,
    kind: kind.value,
  };
  error.value = familyError({
    ...draft.value,
    links: [...draft.value.links, l],
  });
  if (!error.value) draft.value.links.push(l);
}
const members = computed(() =>
  props.npcs.filter((n) => draft.value?.members.includes(n.id)),
);
const nodes = computed(() => {
  const list = members.value,
    levels = new Map(list.map((n) => [n.id, 0]));
  const links = draft.value?.links || [];
  // Couples share a generation. If complex marriages impose conflicting generations,
  // keep ancestry levels and render the cross-generation union explicitly.
  for (let i = 0; i < list.length; i++) {
    let changed = false;
    for (const l of links.filter((l) =>
      ["parent", "adoptive"].includes(l.kind),
    )) {
      const v = (levels.get(l.from) || 0) + 1;
      if (v > (levels.get(l.to) || 0)) {
        levels.set(l.to, v);
        changed = true;
      }
    }
    for (const l of links.filter(
      (l) => !["parent", "adoptive"].includes(l.kind),
    )) {
      const v = Math.max(levels.get(l.from) || 0, levels.get(l.to) || 0);
      if (v < list.length) {
        if (levels.get(l.from) !== v) {
          levels.set(l.from, v);
          changed = true;
        }
        if (levels.get(l.to) !== v) {
          levels.set(l.to, v);
          changed = true;
        }
      }
    }
    if (!changed) break;
  }
  const rows = new Map<number, NPC[]>();
  for (const n of list) {
    const d = Math.min(levels.get(n.id) || 0, list.length);
    rows.set(d, [...(rows.get(d) || []), n]);
  }
  const result: { npc: NPC; x: number; y: number }[] = [];
  const sorted = [...rows.keys()].sort((a, b) => a - b);
  sorted.forEach((level, row) => {
    const pending = [...rows.get(level)!],
      ordered: NPC[] = [];
    while (pending.length) {
      const n = pending.shift()!;
      ordered.push(n);
      for (const l of links.filter(
        (l) =>
          !["parent", "adoptive"].includes(l.kind) &&
          (l.from === n.id || l.to === n.id),
      )) {
        const index = pending.findIndex(
          (p) => p.id === (l.from === n.id ? l.to : l.from),
        );
        if (index >= 0) ordered.push(pending.splice(index, 1)[0]!);
      }
    }
    ordered.forEach((npc, i) =>
      result.push({ npc, x: 40 + i * 210, y: 40 + row * 190 }),
    );
  });
  return result;
});
const width = computed(() =>
    Math.max(700, ...nodes.value.map((n) => n.x + 210)),
  ),
  height = computed(() => Math.max(350, ...nodes.value.map((n) => n.y + 170)));
function path(l: Family["links"][number]) {
  const a = nodes.value.find((n) => n.npc.id === l.from),
    b = nodes.value.find((n) => n.npc.id === l.to);
  if (!a || !b) return "";
  if (["parent", "adoptive"].includes(l.kind)) {
    const ax = a.x + 80,
      ay = a.y + 120,
      bx = b.x + 80,
      by = b.y;
    return `M${ax},${ay} V${(ay + by) / 2} H${bx} V${by}`;
  }
  return `M${a.x + 80},${a.y + 55} L${b.x + 80},${b.y + 55}`;
}
const relation = computed(() =>
  draft.value && pickA.value && pickB.value
    ? kinship(draft.value, pickA.value, pickB.value)
    : "Выберите двух участников",
);
let drag: { x: number; y: number; left: number; top: number } | null = null;
function pan(e: PointerEvent) {
  if ((e.target as HTMLElement).closest("button")) return;
  const el = e.currentTarget as HTMLElement;
  drag = { x: e.clientX, y: e.clientY, left: el.scrollLeft, top: el.scrollTop };
  el.setPointerCapture(e.pointerId);
}
function move(e: PointerEvent) {
  if (!drag) return;
  const el = e.currentTarget as HTMLElement;
  el.scrollLeft = drag.left - (e.clientX - drag.x);
  el.scrollTop = drag.top - (e.clientY - drag.y);
}
</script>
<template>
  <section class="family-page">
    <div class="character-page-heading">
      <div>
        <span class="eyebrow">FAMILY WORKSHOP</span>
        <h2>Семьи и родословные</h2>
        <p>Родители сверху, дети ниже. Пары соединены горизонтально.</p>
      </div>
      <button class="primary" @click="open()">Создать семью</button>
    </div>
    <div class="family-list">
      <button v-for="f in modelValue" :key="f.id" @click="open(f)">
        {{ f.name }} · {{ f.members.length }}
      </button>
    </div>
    <p v-if="!draft" class="panel">
      {{
        modelValue.length
          ? "Выберите семью для редактирования"
          : "Семей пока нет. Создайте семью и добавьте своих персонажей."
      }}
    </p>
    <template v-if="draft">
      <p v-if="error" class="character-error" role="alert">{{ error }}</p>
      <section class="panel family-meta">
        <label
          >Название семьи<input v-model="draft.name" maxlength="80" /></label
        ><label
          >Место проживания<input v-model="draft.home" maxlength="200" /></label
        ><label
          >Описание<textarea
            v-model="draft.description"
            maxlength="3000"
          /></label
        ><button class="primary" @click="save">Сохранить семью</button
        ><small>Изменения применяются после сохранения.</small>
      </section>
      <section class="panel">
        <h3>Участники семьи</h3>
        <p v-if="!npcs.length">
          Сначала создайте персонажей в разделе «Персонажи».
        </p>
        <div class="family-members">
          <label v-for="n in npcs" :key="n.id"
            ><input
              type="checkbox"
              :checked="draft.members.includes(n.id)"
              @change="member(n.id, $event)"
            /><img v-if="n.photo" :src="n.photo" :alt="n.name" />{{
              n.name
            }}</label
          >
        </div>
      </section>
      <section class="panel family-links">
        <h3>Добавить связь</h3>
        <label
          >Первый участник<select v-model="from">
            <option value="">Выберите</option>
            <option v-for="n in members" :key="n.id" :value="n.id">
              {{ n.name }}
            </option>
          </select></label
        ><label
          >Связь<select v-model="kind">
            <option v-for="(label, key) in labels" :key="key" :value="key">
              {{ label }}
            </option>
          </select></label
        ><label
          >Второй участник<select v-model="to">
            <option value="">Выберите</option>
            <option v-for="n in members" :key="n.id" :value="n.id">
              {{ n.name }}
            </option>
          </select></label
        ><button @click="addLink" :disabled="!from || !to">
          Добавить связь
        </button>
        <p class="hint">
          Для родительства первый участник — родитель, второй — ребёнок.
        </p>
        <div v-for="l in draft.links" :key="l.id" class="family-link-row">
          {{ npcs.find((n) => n.id === l.from)?.name }} — {{ labels[l.kind] }} —
          {{ npcs.find((n) => n.id === l.to)?.name }}
          <button
            @click="draft.links = draft.links.filter((x) => x.id !== l.id)"
          >
            Убрать связь
          </button>
        </div>
      </section>
      <section class="panel">
        <div class="character-page-heading">
          <h3>Семейное дерево</h3>
          <div>
            <button
              @click="zoom = Math.max(0.4, zoom - 0.1)"
              aria-label="Уменьшить дерево"
            >
              −</button
            ><button @click="zoom = 1">100%</button
            ><button
              @click="zoom = Math.min(2, zoom + 0.1)"
              aria-label="Увеличить дерево"
            >
              +
            </button>
          </div>
        </div>
        <p class="hint">
          Сплошная янтарная линия — родитель, пунктирная — приёмный родитель.
          Синяя — пара, серая пунктирная — бывшие партнёры. Перетаскивайте фон
          для перемещения.
        </p>
        <div
          class="tree-viewport"
          @pointerdown="pan"
          @pointermove="move"
          @pointerup="drag = null"
          @pointercancel="drag = null"
        >
          <div
            :style="{
              width: width * zoom + 'px',
              height: height * zoom + 'px',
            }"
          >
            <div
              class="tree-canvas"
              :style="{
                width: width + 'px',
                height: height + 'px',
                transform: `scale(${zoom})`,
              }"
            >
              <svg :width="width" :height="height" aria-hidden="true">
                <path
                  v-for="l in draft.links"
                  :key="l.id"
                  :d="path(l)"
                  fill="none"
                  :stroke="
                    ['parent', 'adoptive'].includes(l.kind)
                      ? '#e6ae50'
                      : l.kind === 'former'
                        ? '#80858e'
                        : '#6599d8'
                  "
                  stroke-width="2"
                  :stroke-dasharray="
                    ['adoptive', 'former'].includes(l.kind) ? '6 5' : undefined
                  "
                /></svg
              ><button
                v-for="n in nodes"
                :key="n.npc.id"
                class="tree-person"
                :style="{ left: n.x + 'px', top: n.y + 'px' }"
                @click="emit('open-character', n.npc.id)"
              >
                <img
                  v-if="n.npc.photo"
                  :src="n.npc.photo"
                  :alt="n.npc.name"
                /><span v-else class="tree-initial">{{
                  n.npc.name.slice(0, 1)
                }}</span
                ><strong>{{ n.npc.name }}</strong
                ><small>{{ n.npc.role }}</small>
              </button>
            </div>
          </div>
        </div>
        <div class="family-compare">
          <label
            >Кто<select v-model="pickA" aria-label="Кто">
              <option value="">Выберите</option>
              <option v-for="n in members" :key="n.id" :value="n.id">
                {{ n.name }}
              </option>
            </select></label
          ><label
            >Кому<select v-model="pickB" aria-label="Кому">
              <option value="">Выберите</option>
              <option v-for="n in members" :key="n.id" :value="n.id">
                {{ n.name }}
              </option>
            </select></label
          ><strong>{{ relation }}</strong>
        </div>
      </section>
    </template>
  </section>
</template>
