<script setup lang="ts">
import { computed, ref, watch } from "vue";
import {
  emptyProfile,
  relationshipKinds,
  type CharacterProfile,
} from "../../shared/character";
import { npcSchema, voices, models, type NPC } from "../../shared/schema";
import {
  characterSections,
  attributeLabels,
  relationshipLabels,
  mechanicLabels,
  type CharacterField,
} from "../character-fields";
import { voiceInfo, genderLabel, emotionPresets } from "../voice-options";
const props = defineProps<{ character?: NPC; others: NPC[] }>(),
  emit = defineEmits<{
    save: [character: NPC, openStudio: boolean];
    cancel: [];
  }>();
const draft = ref<NPC>(
  props.character
    ? JSON.parse(JSON.stringify(props.character))
    : {
        id: "npc_" + crypto.randomUUID().slice(0, 8),
        name: "",
        role: "",
        text: "",
        settings: {
          voice: "Kore",
          model: models[0],
          emotion: "Спокойная",
          pace: 1,
          direction: "",
        },
        profile: emptyProfile(),
      },
);
const original = ref(JSON.stringify(draft.value)),
  active = ref("identity"),
  error = ref("");
const dirty = computed(() => JSON.stringify(draft.value) !== original.value),
  section = computed(() =>
    characterSections.find((s) => s.id === active.value)!,
  );
const remoteChanged = ref(false);
watch(
  () => props.character,
  (value) => {
    if (!value) return;
    if (dirty.value && JSON.stringify(value) !== original.value) {
      remoteChanged.value = true;
      error.value =
        "Профиль изменился после открытия страницы. Обновите форму перед сохранением, чтобы не затереть чужие изменения.";
    } else {
      draft.value = JSON.parse(JSON.stringify(value));
      original.value = JSON.stringify(draft.value);
      remoteChanged.value = false;
    }
  },
);
function reloadForm() {
  if (props.character) {
    draft.value = JSON.parse(JSON.stringify(props.character));
    original.value = JSON.stringify(draft.value);
    remoteChanged.value = false;
    error.value = "";
  }
}
function value(field: CharacterField) {
  return (draft.value.profile[field.key] ?? "") as string | number;
}
function set(field: CharacterField, event: Event) {
  const text = (event.target as HTMLInputElement).value;
  (draft.value.profile as Record<string, unknown>)[field.key] =
    field.kind === "number" ? (text === "" ? null : Number(text)) : text;
}
function stat(key: keyof CharacterProfile["attributes"], event: Event) {
  const v = (event.target as HTMLInputElement).value;
  draft.value.profile.attributes[key] = v === "" ? null : Number(v);
}
function save(openStudio = false) {
  if (remoteChanged.value) {
    error.value = "Загрузите обновлённый профиль перед сохранением.";
    return;
  }
  if (!props.character && props.others.length >= 100) {
    error.value = "В проекте может быть максимум 100 персонажей.";
    return;
  }
  error.value = "";
  draft.value.name = draft.value.name.trim();
  if (!draft.value.role && draft.value.profile.profession)
    draft.value.role = draft.value.profile.profession.slice(0, 120);
  const parsed = npcSchema.safeParse(draft.value);
  if (!parsed.success) {
    error.value = !draft.value.name
      ? "Укажите имя персонажа."
      : "Проверьте поля: возраст 0–150 лет, характеристики 0–100 и корректное время в расписании. ID — маленькая латиница, цифры, дефис или подчёркивание.";
    return;
  }
  if (
    props.others.some(
      (n) => n.id === parsed.data.id && n.id !== props.character?.id,
    )
  ) {
    error.value = "Персонаж с таким ID уже существует.";
    return;
  }
  if (
    parsed.data.profile.relationships.some(
      (r) => !r.otherId && !r.otherName.trim(),
    )
  ) {
    active.value = "family";
    error.value = "Укажите человека для каждой связи или удалите пустую связь.";
    return;
  }
  original.value = JSON.stringify(parsed.data);
  emit("save", parsed.data, openStudio);
}
function addRelation() {
  draft.value.profile.relationships.push({
    kind: "friend",
    otherId: "",
    otherName: "",
    trust: 0,
    affection: 0,
    respect: 0,
    tension: 0,
    status: "",
    notes: "",
  });
}
function link(index: number, e: Event) {
  const row = draft.value.profile.relationships[index]!;
  row.otherId = (e.target as HTMLSelectElement).value;
  const n = props.others.find((n) => n.id === row.otherId);
  if (n) row.otherName = n.name;
}
</script>
<template>
  <form class="character-page" novalidate @submit.prevent="save(false)">
    <div class="character-page-heading">
      <div>
        <span class="eyebrow">GAME CHARACTER WORKSHOP</span>
        <h2>
          {{
            props.character ? "Редактирование персонажа" : "Создание персонажа"
          }}
        </h2>
        <p>
          {{
            props.character
              ? dirty
                ? "Есть несохранённые изменения"
                : "Профиль сохранён"
              : "Новый персонаж — появится в проекте после сохранения"
          }}
        </p>
      </div>
      <div class="character-save-actions">
        <button type="button" @click="emit('cancel')">
          Вернуться к персонажам</button
        ><button class="primary" type="submit">Сохранить персонажа</button>
      </div>
    </div>
    <p v-if="error" class="character-error" role="alert">
      {{ error
      }}<button v-if="remoteChanged" type="button" @click="reloadForm">
        Загрузить обновлённую форму
      </button>
    </p>
    <section class="panel character-basics">
      <label
        >Имя<input
          v-model="draft.name"
          maxlength="80"
          placeholder="Имя персонажа" /></label
      ><label
        >Роль<input
          v-model="draft.role"
          maxlength="120"
          placeholder="Например, фермер, торговец, лекарь" /></label
      ><label
        >ID персонажа<input
          v-model="draft.id"
          maxlength="60"
          :readonly="!!props.character"
        /><small
          >Постоянный идентификатор для связей, дублей и Godot.</small
        ></label
      >
    </section>
    <div class="character-page-body">
      <aside class="character-section-nav panel">
        <button
          v-for="s in characterSections"
          :key="s.id"
          type="button"
          :aria-pressed="active === s.id"
          @click="active = s.id"
        >
          {{ s.title }}
        </button>
      </aside>
      <section class="panel character-section">
        <h3>{{ section.title }}</h3>
        <p class="hint">{{ section.description }}</p>
        <div class="character-fields">
          <label
            v-for="field in section.fields"
            :key="field.key"
            :class="{ wide: field.kind === 'area' }"
            >{{ field.label
            }}<textarea
              v-if="field.kind === 'area'"
              :value="value(field)"
              rows="3"
              maxlength="1500"
              @input="set(field, $event)" /><select
              v-else-if="field.kind === 'select'"
              :value="value(field)"
              @change="set(field, $event)"
            >
              <option v-for="[v, label] in field.options" :key="v" :value="v">
                {{ label }}
              </option></select
            ><input
              v-else
              :value="value(field)"
              :type="field.kind === 'number' ? 'number' : 'text'"
              :min="field.kind === 'number' ? 0 : undefined"
              :max="field.key === 'age' ? 150 : undefined"
              :maxlength="250"
              placeholder="Не указано"
              @input="set(field, $event)"
          /></label>
        </div>
        <template v-if="active === 'world'"
          ><h4>Участие в механиках</h4>
          <div class="mechanic-grid">
            <label v-for="(label, key) in mechanicLabels" :key="key"
              ><input
                v-model="draft.profile.mechanics"
                type="checkbox"
                :value="key"
              />{{ label }}</label
            >
          </div>
          <div class="subsection-heading">
            <h4>Расписание и поведение</h4>
            <button
              type="button"
              :disabled="draft.profile.schedule.length >= 50"
              @click="
                draft.profile.schedule.push({
                  day: 'daily',
                  start: '08:00',
                  end: '18:00',
                  place: '',
                  activity: '',
                })
              "
            >
              Добавить занятие
            </button>
          </div>
          <article
            v-for="(row, i) in draft.profile.schedule"
            :key="i"
            class="profile-row"
          >
            <div class="character-fields">
              <label
                >День<select v-model="row.day">
                  <option value="daily">Каждый день</option>
                  <option value="mon">Понедельник</option>
                  <option value="tue">Вторник</option>
                  <option value="wed">Среда</option>
                  <option value="thu">Четверг</option>
                  <option value="fri">Пятница</option>
                  <option value="sat">Суббота</option>
                  <option value="sun">Воскресенье</option>
                </select></label
              ><label>С<input v-model="row.start" type="time" /></label
              ><label>До<input v-model="row.end" type="time" /></label
              ><label>Место<input v-model="row.place" maxlength="250" /></label
              ><label class="wide"
                >Занятие<input v-model="row.activity" maxlength="500"
              /></label>
            </div>
            <button type="button" @click="draft.profile.schedule.splice(i, 1)">
              Убрать занятие
            </button>
          </article></template
        >
        <template v-if="active === 'family'"
          ><label class="profile-check"
            ><input
              v-model="draft.profile.romanceAvailable"
              type="checkbox"
            />Доступна романтическая линия</label
          >
          <div class="subsection-heading">
            <h4>Семейное древо и социальные связи</h4>
            <button
              type="button"
              :disabled="draft.profile.relationships.length >= 50"
              @click="addRelation"
            >
              Добавить связь
            </button>
          </div>
          <p class="hint">
            Можно связать уже созданных персонажей или указать имя человека,
            которого ещё нет в каталоге. Связь описывается со стороны текущего
            персонажа.
          </p>
          <article
            v-for="(row, i) in draft.profile.relationships"
            :key="i"
            class="profile-row"
          >
            <div class="character-fields">
              <label
                >Тип связи<select v-model="row.kind">
                  <option
                    v-for="kind in relationshipKinds"
                    :key="kind"
                    :value="kind"
                  >
                    {{ relationshipLabels[kind] }}
                  </option>
                </select></label
              ><label
                >Персонаж в каталоге<select
                  :value="row.otherId"
                  @change="link(i, $event)"
                >
                  <option value="">Указать имя вручную</option>
                  <option
                    v-for="n in props.others.filter((n) => n.id !== draft.id)"
                    :key="n.id"
                    :value="n.id"
                  >
                    {{ n.name }} · {{ n.role }}
                  </option>
                </select></label
              ><label
                >Имя связанного персонажа<input
                  v-model="row.otherName"
                  maxlength="80" /></label
              ><label
                >Состояние связи<input
                  v-model="row.status"
                  maxlength="250"
                  placeholder="Близкие, поссорились, потеряли связь…" /></label
              ><label
                >Доверие (−100…100)<input
                  v-model.number="row.trust"
                  type="number"
                  min="-100"
                  max="100" /></label
              ><label
                >Привязанность (−100…100)<input
                  v-model.number="row.affection"
                  type="number"
                  min="-100"
                  max="100" /></label
              ><label
                >Уважение (−100…100)<input
                  v-model.number="row.respect"
                  type="number"
                  min="-100"
                  max="100" /></label
              ><label
                >Напряжение (0…100)<input
                  v-model.number="row.tension"
                  type="number"
                  min="0"
                  max="100" /></label
              ><label class="wide"
                >История отношений<textarea
                  v-model="row.notes"
                  maxlength="1000"
                  rows="3"
                />
              </label>
            </div>
            <button
              type="button"
              @click="draft.profile.relationships.splice(i, 1)"
            >
              Убрать связь
            </button>
          </article></template
        >
        <template v-if="active === 'voice'"
          ><div class="character-fields">
            <label
              >Голос Gemini<select v-model="draft.settings.voice">
                <option v-for="v in voices" :key="v" :value="v">
                  {{ v }} — {{ genderLabel(v) }} · {{ voiceInfo[v].character }}
                </option>
              </select></label
            ><label
              >Модель<select v-model="draft.settings.model">
                <option v-for="m in models" :key="m" :value="m">{{ m }}</option>
              </select></label
            >
          </div>
          <h4>Пресеты эмоций</h4>
          <div class="emotion-presets">
            <button
              v-for="p in emotionPresets"
              :key="p.label"
              type="button"
              :aria-pressed="draft.settings.emotion === p.emotion"
              @click="draft.settings.emotion = p.emotion"
            >
              {{ p.label }}
            </button>
          </div>
          <label
            >Эмоция и настроение<input
              v-model="draft.settings.emotion"
              maxlength="100" /></label
          ><label
            >Темп речи<input
              v-model.number="draft.settings.pace"
              type="range"
              min="0.5"
              max="1.5"
              step="0.05"
            />{{ draft.settings.pace }}×</label
          ><label
            >Режиссёрские указания<textarea
              v-model="draft.settings.direction"
              rows="4"
              maxlength="1000"
            /></label
          ><label
            >Тестовая реплика<textarea
              v-model="draft.text"
              rows="3"
              maxlength="600"
            /></label
          ><button type="button" class="primary open-voice" @click="save(true)">
            Сохранить и открыть студию
          </button></template
        >
        <template v-if="active === 'extra'"
          ><h4>Начальные характеристики (0–100)</h4>
          <p class="hint">Пустое поле означает, что значение пока не задано.</p>
          <div class="character-fields">
            <label v-for="(label, key) in attributeLabels" :key="key"
              >{{ label
              }}<input
                :value="draft.profile.attributes[key] ?? ''"
                type="number"
                min="0"
                max="100"
                placeholder="Не задано"
                @input="stat(key, $event)"
            /></label>
          </div>
          <div class="subsection-heading">
            <h4>Дополнительные характеристики</h4>
            <button
              type="button"
              :disabled="draft.profile.custom.length >= 50"
              @click="
                draft.profile.custom.push({ key: '', value: '', notes: '' })
              "
            >
              Добавить поле
            </button>
          </div>
          <article
            v-for="(row, i) in draft.profile.custom"
            :key="i"
            class="profile-row"
          >
            <div class="character-fields">
              <label
                >Название характеристики<input
                  v-model="row.key"
                  maxlength="80" /></label
              ><label
                >Значение<input v-model="row.value" maxlength="1000" /></label
              ><label class="wide"
                >Пояснение<input v-model="row.notes" maxlength="500"
              /></label>
            </div>
            <button type="button" @click="draft.profile.custom.splice(i, 1)">
              Убрать поле
            </button>
          </article></template
        >
      </section>
    </div>
    <div class="character-bottom-actions">
      <button type="button" @click="emit('cancel')">
        Вернуться к персонажам</button
      ><button type="button" @click="save(true)">
        Сохранить и открыть студию</button
      ><button class="primary" type="submit">Сохранить персонажа</button>
    </div>
  </form>
</template>
