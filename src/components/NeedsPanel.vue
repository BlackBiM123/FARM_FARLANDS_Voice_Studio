<script setup lang="ts">
import { computed } from "vue";
import { needsDefaults, type NeedsRules } from "../../shared/needs";
import type { WorldAgent } from "../../shared/world";
const model = defineModel<NeedsRules>();
const selected = defineModel<string>("selected");
const props = defineProps<{
  active?: NeedsRules;
  running: boolean;
  actor?: WorldAgent | null;
  actors: { id: string; name: string }[];
}>();
const draft = computed(() => model.value ?? needsDefaults);
const effective = computed(() => props.active ?? needsDefaults);
const changed = computed(
  () => JSON.stringify(draft.value) !== JSON.stringify(effective.value),
);
type Field = {
  key: keyof NeedsRules;
  label: string;
  max: number;
  min?: number;
  percent?: boolean;
};
const groups: { title: string; fields: Field[] }[] = [
  {
    title: "Начало запуска",
    fields: [
      { key: "initialFullness", label: "Сытость", max: 100, percent: true },
      { key: "initialEnergy", label: "Энергия", max: 100, percent: true },
    ],
  },
  {
    title: "Расход и восстановление",
    fields: [
      {
        key: "fullnessDrain",
        label: "Расход сытости, п.п./мин",
        max: 2,
        percent: true,
      },
      {
        key: "energyDrain",
        label: "Расход энергии в действии, п.п./мин",
        max: 2,
        percent: true,
      },
      {
        key: "restGain",
        label: "Энергия во сне, п.п./мин",
        min: 0.1,
        max: 5,
        percent: true,
      },
      {
        key: "mealGain",
        label: "Сытость за порцию, п.п.",
        max: 100,
        percent: true,
      },
    ],
  },
  {
    title: "Когда возникает потребность",
    fields: [
      {
        key: "eatThreshold",
        label: "Искать еду при сытости ниже, %",
        max: 100,
        percent: true,
      },
      {
        key: "restThreshold",
        label: "Отдыхать при энергии ниже, %",
        max: 100,
        percent: true,
      },
    ],
  },
  {
    title: "Приоритет среди доступных действий",
    fields: [
      { key: "eatPriority", label: "Еда", min: 1, max: 200 },
      { key: "restPriority", label: "Отдых при усталости", min: 1, max: 200 },
      { key: "nightPriority", label: "Ночной отдых", min: 1, max: 200 },
    ],
  },
];
function update(field: Field, event: Event) {
  const input = event.target as HTMLInputElement;
  if (!input.validity.valid || input.value === "") {
    input.reportValidity();
    input.value = String(shown(draft.value[field.key], field));
    return;
  }
  model.value = {
    ...draft.value,
    [field.key]: Math.round(Number(input.value) * (field.percent ? 10 : 1)),
  };
}
function shown(value: number, field: Field) {
  return value / (field.percent ? 10 : 1);
}
const forecast = computed(() => {
  const a = props.actor,
    r = effective.value;
  if (!a) return "";
  if (a.action.type === "rest")
    return `Сейчас отдыхает: энергия +${r.restGain / 10} п.п./мин, сытость −${r.fullnessDrain / 10} п.п./мин.`;
  return `Сытость −${r.fullnessDrain / 10} п.п./мин. Энергия ${Object.keys(a.action).length ? "−" + r.energyDrain / 10 : "0"} п.п./мин. Показатели ограничены 0–100%.`;
});
</script>

<template>
  <details class="panel needs-panel">
    <summary>
      Потребности и правила поведения <span>Сытость · Энергия</span>
    </summary>
    <p class="hint">
      Правила для всех NPC. Изменения применяются через «Новый запуск»;
      «Сохранить мир» сохраняет настройки в проект. Текущий запуск продолжает
      использовать свои правила. 100% — полный запас; 0,1 п.п./мин означает 6
      процентных пунктов за игровой час.
    </p>
    <p v-if="running && changed" class="needs-pending" role="status">
      Есть изменения для следующего запуска. В колонке «В запуске» — действующие
      значения.
    </p>
    <div class="needs-layout">
      <div class="needs-settings">
        <fieldset v-for="group in groups" :key="group.title">
          <legend>{{ group.title }}</legend>
          <div class="needs-columns">
            <span>Параметр</span><span>Следующий</span
            ><span v-if="running">В запуске</span>
          </div>
          <label
            v-for="field in group.fields"
            :key="field.key"
            class="needs-field"
          >
            <span>{{ field.label }}</span>
            <input
              :aria-label="field.label"
              type="number"
              :min="field.min ?? 0"
              :max="field.max"
              :step="field.percent ? 0.1 : 1"
              :value="shown(draft[field.key], field)"
              @change="update(field, $event)"
            />
            <output v-if="running">{{
              shown(effective[field.key], field)
            }}</output>
          </label>
        </fieldset>
        <button @click="model = { ...needsDefaults }">
          Вернуть базовые правила в черновик
        </button>
      </div>
      <div class="needs-observer">
        <h3>Как NPC выбирает действие</h3>
        <p>
          Сначала проверяются условия: порог потребности, время, маршрут, деньги
          и запас товара. Из доступных вариантов выбирается самый высокий
          приоритет. Значение −1 означает, что вариант сейчас недоступен.
        </p>
        <p>
          Работа — 80, покупка дома — 95, общение — 40. Еда и отдых конкурируют
          с ними по настроенным приоритетам. Начатое действие завершается до
          следующего выбора.
        </p>
        <template v-if="actor">
          <h3>Наблюдение за персонажем</h3>
          <label class="needs-picker"
            >Персонаж<select
              v-model="selected"
              aria-label="NPC в панели потребностей"
            >
              <option v-for="npc in actors" :key="npc.id" :value="npc.id">
                {{ npc.name }}
              </option>
            </select></label
          >
          <div class="needs-levels">
            <label
              >Сытость
              <meter
                min="0"
                max="1000"
                :low="effective.eatThreshold"
                :value="actor.hunger"
              />{{ Math.round(actor.hunger / 10) }}%</label
            >
            <label
              >Энергия
              <meter
                min="0"
                max="1000"
                :low="effective.restThreshold"
                :value="actor.energy"
              />{{ Math.round(actor.energy / 10) }}%</label
            >
          </div>
          <p>{{ forecast }}</p>
          <p class="hint">
            Причины ниже зафиксированы при последнем выборе; значения
            потребностей выше — текущие.
          </p>
          <div
            v-for="choice in actor.choices.filter((c) =>
              ['Отдых', 'Поесть'].includes(c.action),
            )"
            :key="choice.action"
            class="needs-choice"
          >
            <strong
              >{{ choice.action }} ·
              {{
                choice.score < 0 ? "недоступно" : "приоритет " + choice.score
              }}</strong
            >
            <p>{{ choice.reason }}</p>
          </div>
        </template>
        <p v-else class="hint">
          Создайте запуск и выберите NPC в блоке наблюдения, чтобы увидеть его
          потребности и причины решений.
        </p>
        <p class="hint">
          Общение пока не отдельная потребность: оно зависит от времени и
          согласия собеседника. Добавление новой потребности требует правила в
          общем ядре; произвольное поле само по себе не меняет поведение.
        </p>
      </div>
    </div>
  </details>
</template>

<style scoped>
.needs-panel {
  margin-bottom: 18px;
  padding: 18px;
}
.needs-panel summary {
  cursor: pointer;
  font-weight: 700;
}
.needs-panel summary span {
  margin-left: 12px;
  font-weight: 400;
  color: var(--muted, #94959d);
  font-size: 0.85em;
}
.needs-panel p {
  line-height: 1.55;
  margin: 12px 0;
}
.needs-layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 24px;
  margin-top: 16px;
}
.needs-settings fieldset {
  border: 1px solid #ffffff18;
  border-radius: 10px;
  padding: 12px;
  margin: 0 0 12px;
  min-width: 0;
}
.needs-settings legend {
  padding: 0 7px;
  font-size: 0.9rem;
}
.needs-field,
.needs-columns {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 85px 65px;
  align-items: center;
  gap: 8px;
  margin: 8px 0;
}
.needs-field {
  font-size: 0.85rem;
}
.needs-field input {
  width: 100%;
  min-width: 0;
  padding: 7px 9px;
  box-sizing: border-box;
}
.needs-columns {
  font-size: 0.7rem;
  color: #999;
}
.needs-field output {
  text-align: center;
  color: #bbb;
}
.needs-picker {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: center;
  margin-bottom: 16px;
}
.needs-picker select {
  max-width: 100%;
  padding: 8px;
}
.needs-observer {
  min-width: 0;
}
.needs-observer h3 {
  margin: 0 0 12px;
}
.needs-observer h3:not(:first-child) {
  margin-top: 24px;
}
.needs-levels {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
}
.needs-levels label {
  display: flex;
  gap: 8px;
  align-items: center;
}
.needs-levels meter {
  width: 90px;
}
.needs-choice {
  border-left: 3px solid #d2a451;
  padding: 8px 12px;
  margin: 12px 0;
  background: #ffffff04;
}
.needs-choice p {
  margin: 6px 0 0;
  font-size: 0.85rem;
}
.needs-pending {
  color: #e7b663;
}
@media (max-width: 800px) {
  .needs-layout {
    grid-template-columns: 1fr;
    gap: 18px;
  }
  .needs-panel {
    padding: 12px;
  }
  .needs-field,
  .needs-columns {
    grid-template-columns: minmax(0, 1fr) 65px 48px;
    gap: 5px;
  }
}
</style>
