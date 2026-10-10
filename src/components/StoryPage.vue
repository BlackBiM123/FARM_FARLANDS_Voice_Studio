<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { Plus, GripVertical, Trash2, ArrowRight } from "lucide-vue-next";
import {
  scenarioSchema,
  scenarioStates,
  scenarioStateLabels,
  scenarioTypes,
  scenarioTypeLabels,
  effectMetrics,
  effectMetricLabels,
  type Scenario,
  type DialogueLine,
} from "../../shared/content";
import type { NPC } from "../../shared/schema";
const scenarios = defineModel<Scenario[]>({ required: true });
const props = defineProps<{
  npcs: NPC[];
  lines: DialogueLine[];
  initialId?: string;
}>();
const emit = defineEmits<{
  openCharacter: [id: string];
  openLines: [id: string];
  addLine: [scenarioId: string, npcId: string];
}>();
const selected = ref(props.initialId || ""),
  kind = ref(""),
  query = ref(""),
  participant = ref(""),
  dragged = ref(""),
  dropState = ref(""),
  message = ref(""),
  armed = ref(false);
const current = computed(() =>
  scenarios.value.find((s) => s.id === selected.value),
);
const filtered = computed(() =>
  scenarios.value.filter(
    (s) =>
      (!kind.value || s.kind === kind.value) &&
      (!participant.value ||
        s.initiatorId === participant.value ||
        s.targets.includes(participant.value)) &&
      (!query.value ||
        (s.title + " " + s.description + " " + s.cause)
          .toLowerCase()
          .includes(query.value.toLowerCase())),
  ),
);
const people = (s: Scenario) =>
  props.npcs.filter((n) => n.id === s.initiatorId || s.targets.includes(n.id));
const person = (id: string | null) => props.npcs.find((n) => n.id === id);
watch(
  () => props.initialId,
  (id) => {
    if (id) selected.value = id;
  },
);
watch(selected, () => (armed.value = false));
function create(type: "interaction" | "conflict") {
  if (scenarios.value.length >= 500) {
    message.value = "Достигнут лимит сценариев проекта";
    return;
  }
  const s = scenarioSchema.parse({
    id: crypto.randomUUID(),
    kind: type,
    title: type === "conflict" ? "Новый конфликт" : "Новое взаимодействие",
    type: type === "conflict" ? "values" : "conversation",
    initiatorId: props.npcs[0]?.id ?? null,
  });
  scenarios.value = [...scenarios.value, s];
  selected.value = s.id;
  kind.value = "";
  query.value = "";
  participant.value = "";
  message.value = "Карточка создана. Изменения сохраняются автоматически.";
}
function toggleTarget(s: Scenario, id: string) {
  if (s.targets.includes(id)) s.targets = s.targets.filter((x) => x !== id);
  else if (s.targets.length < 10) s.targets.push(id);
  else message.value = "Не больше 10 участников помимо инициатора";
}
function drop(state: Scenario["state"], e: DragEvent) {
  const id = e.dataTransfer?.getData("application/x-farlands-scenario");
  const s = scenarios.value.find((s) => s.id === id);
  if (s) s.state = state;
  dragged.value = "";
  dropState.value = "";
}
function start(s: Scenario, e: DragEvent) {
  dragged.value = s.id;
  e.dataTransfer?.setData("application/x-farlands-scenario", s.id);
  if (e.dataTransfer) e.dataTransfer.effectAllowed = "move";
}
function addEffect(s: Scenario) {
  if (s.effects.length >= 30) return;
  s.effects.push({
    id: crypto.randomUUID(),
    fromId: s.initiatorId,
    toId: s.targets[0] ?? null,
    metric: "trust",
    delta: 0,
    note: "",
  });
}
function baseline(effect: Scenario["effects"][number]) {
  const p = person(effect.fromId)?.profile.relationships.find(
    (r) => r.otherId === effect.toId,
  );
  return p && effect.metric in p
    ? Number(p[effect.metric as keyof typeof p])
    : null;
}
function preview(effect: Scenario["effects"][number]) {
  const base = baseline(effect);
  if (base === null) return "Нет исходной оценки";
  return `${base} → ${Math.max(effect.metric === "tension" ? 0 : -100, Math.min(100, base + effect.delta))}`;
}
function remove(s: Scenario) {
  if (!armed.value) {
    armed.value = true;
    return;
  }
  if (props.lines.some((l) => l.scenarioId === s.id)) {
    message.value =
      "Сначала отвяжите реплики от сценария. Можно перенести его в архив.";
    return;
  }
  scenarios.value = scenarios.value.filter((x) => x.id !== s.id);
  selected.value = "";
  armed.value = false;
}
function duplicate(s: Scenario) {
  if (scenarios.value.length >= 500) return;
  const clone = JSON.parse(JSON.stringify(s)) as Scenario;
  clone.id = crypto.randomUUID();
  clone.title = (s.title + " · копия").slice(0, 120);
  clone.state = "draft";
  clone.effects = clone.effects.map((e) => ({ ...e, id: crypto.randomUUID() }));
  scenarios.value = [...scenarios.value, clone];
  selected.value = clone.id;
  message.value = "Копия создана без привязки старых реплик.";
}
</script>
<template>
  <section class="story-page content-page">
    <div class="section-heading">
      <div>
        <span class="eyebrow">CHARACTER DYNAMICS</span>
        <h2>Конфликты и взаимодействия</h2>
        <p class="hint">
          Авторские сценарии: кто участвует, что запускает событие и как
          меняются отношения.
        </p>
      </div>
      <div class="story-create-actions">
        <button @click="create('interaction')">
          <Plus :size="16" />Взаимодействие</button
        ><button class="primary" @click="create('conflict')">
          <Plus :size="16" />Конфликт
        </button>
      </div>
    </div>
    <div class="content-toolbar panel">
      <label
        >Вид сценария<select v-model="kind">
          <option value="">Все сценарии</option>
          <option value="interaction">Взаимодействия</option>
          <option value="conflict">Конфликты</option>
        </select></label
      ><label
        >Участник<select v-model="participant">
          <option value="">Все персонажи</option>
          <option v-for="n in npcs" :key="n.id" :value="n.id">
            {{ n.name }}
          </option>
        </select></label
      ><label class="content-search"
        >Поиск сценария<input
          v-model="query"
          placeholder="Название, причина или описание"
      /></label>
    </div>
    <p v-if="message" class="content-message" role="status">{{ message }}</p>
    <div class="story-board-scroll">
      <div class="story-board">
        <section
          v-for="state in scenarioStates"
          :key="state"
          class="story-column"
          :class="{ 'drop-active': dropState === state }"
          @dragover.prevent="dropState = state"
          @dragleave="dropState = ''"
          @drop.prevent="drop(state, $event)"
        >
          <h3>
            {{ scenarioStateLabels[state] }}
            <span>{{ filtered.filter((s) => s.state === state).length }}</span>
          </h3>
          <article
            v-for="s in filtered.filter((s) => s.state === state)"
            :key="s.id"
            class="story-card"
            :class="{ selected: s.id === selected, dragging: dragged === s.id }"
          >
            <div class="story-card-top">
              <span class="state-pill" :class="s.kind">{{
                s.kind === "conflict" ? "Конфликт" : "Взаимодействие"
              }}</span
              ><button
                class="drag-handle"
                draggable="true"
                aria-label="Перетащить сценарий"
                @dragstart="start(s, $event)"
                @dragend="
                  dragged = '';
                  dropState = '';
                "
              >
                <GripVertical :size="16" />
              </button>
            </div>
            <button class="story-card-title" @click="selected = s.id">
              {{ s.title }}</button
            ><small>{{ scenarioTypeLabels[s.type] }}</small>
            <div class="story-card-portraits">
              <span v-for="n in people(s)" :key="n.id" :title="n.name"
                ><img v-if="n.photo" :src="n.photo" :alt="n.name" /><span
                  v-else
                  class="avatar-fallback"
                  >{{ n.name[0] }}</span
                ></span
              >
            </div>
            <small
              >{{ lines.filter((l) => l.scenarioId === s.id).length }} реплик ·
              {{
                s.priority === "high"
                  ? "Высокий приоритет"
                  : s.priority === "low"
                    ? "Низкий приоритет"
                    : "Обычный приоритет"
              }}</small
            ><label class="sr-only" :for="s.id + '-state'"
              >Состояние {{ s.title }}</label
            ><select :id="s.id + '-state'" v-model="s.state">
              <option v-for="st in scenarioStates" :key="st" :value="st">
                {{ scenarioStateLabels[st] }}
              </option>
            </select>
          </article>
          <p
            v-if="!filtered.some((s) => s.state === state)"
            class="column-empty"
          >
            Перетащите карточку сюда
          </p>
        </section>
      </div>
    </div>
    <div v-if="!scenarios.length" class="panel content-empty">
      <h3>Сценариев пока нет</h3>
      <p>
        Создайте взаимодействие или конфликт и задайте участников, причины и
        последствия.
      </p>
    </div>
    <article v-if="current" class="story-editor panel">
      <div class="section-heading">
        <div>
          <span class="eyebrow">{{
            current.kind === "conflict"
              ? "КАРТОЧКА КОНФЛИКТА"
              : "КАРТОЧКА ВЗАИМОДЕЙСТВИЯ"
          }}</span>
          <h3>{{ current.title }}</h3>
        </div>
        <div class="story-create-actions">
          <button @click="duplicate(current)">Копировать</button
          ><button class="danger" @click="remove(current)">
            {{ armed ? "Подтвердить удаление" : "Удалить сценарий" }}
          </button>
        </div>
      </div>
      <div class="story-section">
        <div class="story-field-grid">
          <label class="wide-field"
            >Название сценария<input
              v-model="current.title"
              maxlength="120"
              @blur="
                current.title = current.title.trim() || 'Без названия'
              " /></label
          ><label
            >Вид<select v-model="current.kind">
              <option value="interaction">Взаимодействие</option>
              <option value="conflict">Конфликт</option>
            </select></label
          ><label
            >Тип события<select v-model="current.type">
              <option v-for="type in scenarioTypes" :key="type" :value="type">
                {{ scenarioTypeLabels[type] }}
              </option>
            </select></label
          ><label
            >Состояние сценария<select v-model="current.state">
              <option
                v-for="state in scenarioStates"
                :key="state"
                :value="state"
              >
                {{ scenarioStateLabels[state] }}
              </option>
            </select></label
          ><label
            >Приоритет<select v-model="current.priority">
              <option value="low">Низкий</option>
              <option value="normal">Обычный</option>
              <option value="high">Высокий</option>
            </select></label
          ><label
            >Напряжённость · {{ current.intensity }}/100<input
              v-model.number="current.intensity"
              type="range"
              min="0"
              max="100"
              step="1" /></label
          ><label
            >Повтор не раньше, игровых часов<input
              v-model.number="current.cooldownHours"
              type="number"
              min="0"
              max="8760"
              @blur="
                current.cooldownHours = Number(current.cooldownHours) || 0
              "
          /></label>
        </div>
      </div>
      <section class="story-section">
        <h4>Участники</h4>
        <label
          >Инициатор<select
            v-model="current.initiatorId"
            @change="
              current.targets = current.targets.filter(
                (id) => id !== current!.initiatorId,
              )
            "
          >
            <option :value="null">Пока не выбран</option>
            <option v-for="n in npcs" :key="n.id" :value="n.id">
              {{ n.name }}
            </option>
          </select></label
        >
        <p class="hint">
          Выберите остальных участников. Для внутреннего конфликта достаточно
          одного персонажа.
        </p>
        <div class="participant-picker">
          <label
            v-for="n in npcs.filter((n) => n.id !== current!.initiatorId)"
            :key="n.id"
            :class="{ chosen: current.targets.includes(n.id) }"
            ><input
              type="checkbox"
              :checked="current.targets.includes(n.id)"
              @change="toggleTarget(current!, n.id)"
            /><img v-if="n.photo" :src="n.photo" :alt="n.name" /><span>{{
              n.name
            }}</span></label
          >
        </div>
        <div v-if="current.initiatorId" class="interaction-people">
          <button @click="emit('openCharacter', current.initiatorId!)">
            <img
              v-if="person(current.initiatorId)?.photo"
              :src="person(current.initiatorId)!.photo"
              :alt="person(current.initiatorId)!.name"
            /><span>{{ person(current.initiatorId)?.name }}</span></button
          ><ArrowRight v-if="current.targets.length" :size="23" /><button
            v-for="id in current.targets"
            :key="id"
            @click="emit('openCharacter', id)"
          >
            <img
              v-if="person(id)?.photo"
              :src="person(id)!.photo"
              :alt="person(id)!.name"
            /><span>{{ person(id)?.name }}</span>
          </button>
        </div>
      </section>
      <section class="story-section">
        <h4>Ситуация и запуск</h4>
        <div class="story-field-grid">
          <label class="wide-field"
            >Описание ситуации<textarea
              v-model="current.description"
              rows="3"
              maxlength="1500"
            /></label
          ><label
            >Причина / столкновение интересов<textarea
              v-model="current.cause"
              rows="3"
              maxlength="1000"
              placeholder="Что нужно каждому участнику и почему возникает ситуация"
            /></label
          ><label
            >Событие-триггер<textarea
              v-model="current.trigger"
              rows="3"
              maxlength="1000"
              placeholder="Какое действие или событие запускает сценарий"
            /></label
          ><label class="wide-field"
            >Условия запуска<textarea
              v-model="current.conditions"
              rows="2"
              maxlength="1000"
              placeholder="Время, место, отношения, прогресс заданий"
            />
          </label>
        </div>
      </section>
      <section class="story-section">
        <h4>Развитие и роль игрока</h4>
        <div class="story-field-grid">
          <label
            >Влияние игрока / варианты вмешательства<textarea
              v-model="current.playerInfluence"
              rows="4"
              maxlength="1500"
              placeholder="Помочь, вмешаться, выбрать сторону, ничего не делать…"
            /></label
          ><label
            >Разрешение и возможные исходы<textarea
              v-model="current.resolution"
              rows="4"
              maxlength="1500"
              placeholder="Мирный исход, обострение, компромисс и их последствия"
            /></label
          ><label class="wide-field"
            >Что персонажи запоминают<textarea
              v-model="current.memory"
              rows="2"
              maxlength="1000"
              placeholder="Факт или событие, которое остаётся в памяти после сценария"
            />
          </label>
        </div>
      </section>
      <section class="story-section">
        <div class="section-heading">
          <div>
            <h4>Последствия для отношений</h4>
            <p class="hint">
              От кого → к кому. Это описание изменений для игры; исходные оценки
              в анкетах не перезаписываются.
            </p>
          </div>
          <button
            :disabled="current.effects.length >= 30"
            @click="addEffect(current)"
          >
            <Plus :size="15" />Добавить последствие
          </button>
        </div>
        <div
          v-for="e in current.effects"
          :key="e.id"
          class="relationship-effect"
        >
          <label
            >От кого<select v-model="e.fromId">
              <option :value="null">Выберите персонажа</option>
              <option v-for="n in npcs" :key="n.id" :value="n.id">
                {{ n.name }}
              </option>
            </select></label
          ><label
            >К кому<select v-model="e.toId">
              <option :value="null">Выберите персонажа</option>
              <option v-for="n in npcs" :key="n.id" :value="n.id">
                {{ n.name }}
              </option>
            </select></label
          ><label
            >Показатель<select v-model="e.metric">
              <option v-for="m in effectMetrics" :key="m" :value="m">
                {{ effectMetricLabels[m] }}
              </option>
            </select></label
          ><label
            >Изменение<input
              v-model.number="e.delta"
              type="number"
              min="-100"
              max="100"
              @blur="e.delta = Number(e.delta) || 0" /></label
          ><span class="effect-preview">{{ preview(e) }}</span
          ><button
            class="icon danger"
            aria-label="Удалить последствие"
            @click="
              current.effects = current.effects.filter((x) => x.id !== e.id)
            "
          >
            <Trash2 :size="16" /></button
          ><label class="wide-field"
            >Когда применяется / примечание<input
              v-model="e.note"
              maxlength="500"
              placeholder="Например: только если игрок помог найти компромисс"
          /></label>
        </div>
        <p v-if="!current.effects.length" class="hint">
          Добавьте направленное изменение доверия, привязанности, уважения или
          напряжения.
        </p>
      </section>
      <section class="story-section">
        <div class="section-heading">
          <div>
            <h4>Реплики сценария</h4>
            <p class="hint">
              {{
                lines.filter((l) => l.scenarioId === current!.id).length
              }}
              реплик привязано. Одна реплика может переиспользовать готовый
              аудиодубль.
            </p>
          </div>
          <div class="story-create-actions">
            <button @click="emit('openLines', current.id)">
              Открыть реплики</button
            ><button
              :disabled="!current.initiatorId"
              @click="emit('addLine', current.id, current.initiatorId!)"
            >
              <Plus :size="15" />Реплика инициатора
            </button>
          </div>
        </div>
        <div
          v-for="l in lines.filter((l) => l.scenarioId === current!.id)"
          :key="l.id"
          class="scenario-line"
        >
          <strong>{{ person(l.npcId)?.name }}</strong
          ><span>{{ l.ru.text || l.en.text || "Текст пока не написан" }}</span
          ><small>{{ l.key }}</small>
        </div>
      </section>
    </article>
    <p v-else-if="scenarios.length" class="panel content-empty">
      Выберите карточку на доске, чтобы редактировать сценарий.
    </p>
    <p class="hint content-footnote">
      Сценарии, условия и последствия сохраняются для экспорта в Godot. Доска
      отражает авторский статус; игровую симуляцию и применение последствий
      нужно реализовать в игре.
    </p>
  </section>
</template>
