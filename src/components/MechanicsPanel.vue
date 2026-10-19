<script setup lang="ts">
import { computed, ref } from "vue";
import {
  mechanicsSchema,
  type MechanicsDefinition,
} from "../../shared/mechanics";
import type { WorldAgent, WorldState } from "../../shared/world";
import { addMechanic } from "../mechanics-editor";
import { downloadWorld, formatWorldTime } from "../world-runs";
const model = defineModel<MechanicsDefinition>();
const props = defineProps<{
  active?: MechanicsDefinition;
  state?: WorldState;
  actor?: WorldAgent;
  actorName: string;
}>();
const file = ref<HTMLInputElement>(),
  error = ref(""),
  tab = ref("editor");
const modules = computed(() => model.value?.modules ?? []);
const activeModules = computed(
  () => props.active?.modules.filter((m) => m.enabled) ?? [],
);
const changed = computed(
  () => JSON.stringify(model.value) !== JSON.stringify(props.active),
);
const validity = computed(() =>
  model.value ? mechanicsSchema.safeParse(model.value) : undefined,
);
const rows = computed(() =>
  activeModules.value.flatMap((m) =>
    m.variables.map((v) => ({
      ...v,
      module: m.name,
      key: m.id + ":" + v.id,
      value:
        props.state?.mechanics?.values[m.id + ":" + v.id]?.[
          v.scope === "world" ? "world" : (props.actor?.id ?? "")
        ],
    })),
  ),
);
const versions = computed(() =>
  Object.entries(props.state?.mechanics?.versions ?? {})
    .map(
      ([id, v]) =>
        (id === "core_needs"
          ? "Потребности"
          : id === "core_cooking"
            ? "Кухня"
            : (activeModules.value.find((m) => m.id === id)?.name ?? id)) +
        " v" +
        v,
    )
    .join(" · "),
);
const traces = computed(() =>
  [
    ...(props.actor?.mechanicTrace ?? []),
    ...(props.state?.mechanics?.recent ?? []),
  ]
    .sort((a, b) => b.minute - a.minute)
    .slice(0, 16),
);
function title(id: string) {
  if (id === "core_needs:energy") return "Энергия";
  if (id === "core_needs:fullness") return "Сытость";
  return rows.value.find((v) => v.key === id)?.name ?? id;
}
const rules: Record<string, string> = {
  metabolism: "Расход сытости за минуту",
  activity: "Расход энергии в действии",
  rest: "Восстановление во сне",
  meal: "Эффект съеденной порции",
  drift: "Изменение за минуту",
};
function add(demo = false) {
  model.value = addMechanic(model.value, demo);
}
function removeModule(id: string) {
  model.value = {
    version: 1,
    modules: modules.value.filter((m) => m.id !== id),
  };
}
function addVariable(m: MechanicsDefinition["modules"][number]) {
  let i = 1;
  while (m.variables.some((v) => v.id === "value_" + i)) i++;
  m.variables.push({
    id: "value_" + i,
    name: "Показатель " + i,
    scope: "npc",
    unit: "ед.",
    min: 0,
    max: 100,
    initial: 0,
    perMinute: 1,
  });
}
function addAction(m: MechanicsDefinition["modules"][number]) {
  if (!m.variables.length) return;
  let i = 1;
  while (m.actions.some((a) => a.id === "action_" + i)) i++;
  m.actions.push({
    id: "action_" + i,
    name: "Действие " + i + " · " + m.name,
    variable: m.variables[0]!.id,
    when: "above",
    threshold: m.variables[0]!.initial,
    priority: 50,
    minutes: 5,
    delta: -10,
    place: "current",
  });
}
async function imported(e: Event) {
  const input = e.target as HTMLInputElement,
    f = input.files?.[0];
  input.value = "";
  if (!f) return;
  try {
    if (f.size > 256000) throw Error("Максимум 256 КБ");
    model.value = mechanicsSchema.parse(JSON.parse(await f.text()));
    error.value = "";
  } catch (e) {
    error.value = String(e);
  }
}
</script>
<template>
  <details class="panel mechanics-panel">
    <summary>Механики и показатели <span>Реестр · версия 1</span></summary>
    <p>
      Модуль описывает показатели, их изменение за минуту и действия. Включённые
      модули подключаются к общему исполнителю при новом запуске. Это описание
      правил, без выполнения произвольного кода.
    </p>
    <div class="mechanics-tabs">
      <button :class="{ chosen: tab === 'editor' }" @click="tab = 'editor'">
        Описание модулей</button
      ><button :class="{ chosen: tab === 'observe' }" @click="tab = 'observe'">
        Наблюдение и причины
      </button>
    </div>
    <p v-if="state && changed" class="mechanics-note">
      Черновик отличается от текущего запуска. Сохраните мир и создайте новый
      запуск для применения.
    </p>
    <template v-if="tab === 'editor'">
      <div class="mechanics-system">
        <strong>Системные адаптеры</strong>
        <p>
          Сытость и энергия используют общие диапазоны, эффекты и журнал
          изменений. Настройки — в панели «Потребности и правила поведения».
          Кухня остаётся экспериментальным адаптером с настоящими затратами
          ингредиентов и труда.
        </p>
      </div>
      <div class="mechanics-toolbar">
        <button :disabled="modules.length >= 16" @click="add()">
          Новый модуль</button
        ><button :disabled="modules.length >= 16" @click="add(true)">
          Добавить тестовый модуль</button
        ><button @click="file?.click()">Импорт описания JSON</button
        ><button
          @click="
            downloadWorld(
              model ?? { version: 1, modules: [] },
              'farlands-mechanics.json',
            )
          "
        >
          Экспорт описания</button
        ><input
          ref="file"
          hidden
          type="file"
          accept="application/json"
          @change="imported"
        />
      </div>
      <p class="hint">
        Новые модули изначально выключены. Тестовый модуль — проверка
        расширяемости, не утверждённая механика игры. Показатели сейчас
        принадлежат NPC или всему миру; семейные и хозяйственные связи будут
        отдельными адаптерами.
      </p>
      <details v-for="m in modules" :key="m.id" class="mechanics-module">
        <summary>
          {{ m.name }} · v{{ m.version }} ·
          {{ m.enabled ? "включён" : "выключен" }}
        </summary>
        <div class="mechanics-fields">
          <label>Название модуля<input v-model="m.name" maxlength="80" /></label
          ><label class="mechanics-enable"
            ><input v-model="m.enabled" type="checkbox" />Включить в следующий
            запуск</label
          ><button @click="removeModule(m.id)">
            Удалить модуль из черновика
          </button>
        </div>
        <h4>Показатели</h4>
        <div class="mechanics-scroll">
          <table>
            <thead>
              <tr>
                <th>Название / единица</th>
                <th>Принадлежит</th>
                <th>Мин.</th>
                <th>Макс.</th>
                <th>Начало</th>
                <th>За минуту</th>
                <th />
              </tr>
            </thead>
            <tbody>
              <tr v-for="v in m.variables" :key="v.id">
                <td>
                  <input
                    v-model="v.name"
                    aria-label="Название показателя"
                    maxlength="80"
                  /><input
                    v-model="v.unit"
                    aria-label="Единица показателя"
                    maxlength="24"
                  />
                </td>
                <td>
                  <select v-model="v.scope" aria-label="Область показателя">
                    <option value="npc">Каждому NPC</option>
                    <option value="world">Миру один раз</option>
                  </select>
                </td>
                <td>
                  <input
                    v-model.number="v.min"
                    type="number"
                    aria-label="Минимум показателя"
                  />
                </td>
                <td>
                  <input
                    v-model.number="v.max"
                    type="number"
                    aria-label="Максимум показателя"
                  />
                </td>
                <td>
                  <input
                    v-model.number="v.initial"
                    type="number"
                    aria-label="Начальное значение показателя"
                  />
                </td>
                <td>
                  <input
                    v-model.number="v.perMinute"
                    type="number"
                    aria-label="Изменение показателя за минуту"
                  />
                </td>
                <td>
                  <button
                    @click="
                      m.actions = m.actions.filter((a) => a.variable !== v.id);
                      m.variables = m.variables.filter((x) => x.id !== v.id);
                    "
                  >
                    Убрать
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <button :disabled="m.variables.length >= 16" @click="addVariable(m)">
          Добавить показатель
        </button>
        <h4>Действия</h4>
        <div v-for="a in m.actions" :key="a.id" class="mechanics-action">
          <div class="mechanics-fields">
            <label
              >Название действия<input v-model="a.name" maxlength="80" /></label
            ><label
              >Показатель<select v-model="a.variable">
                <option v-for="v in m.variables" :key="v.id" :value="v.id">
                  {{ v.name }}
                </option>
              </select></label
            ><label
              >Условие<select v-model="a.when">
                <option value="above">Выше порога</option>
                <option value="below">Ниже порога</option>
              </select></label
            ><label
              >Порог<input v-model.number="a.threshold" type="number" /></label
            ><label
              >Приоритет<input
                v-model.number="a.priority"
                type="number"
                min="1"
                max="200" /></label
            ><label
              >Длительность, мин<input
                v-model.number="a.minutes"
                type="number"
                min="1"
                max="1440" /></label
            ><label
              >Изменение после завершения<input
                v-model.number="a.delta"
                type="number" /></label
            ><label
              >Где выполнять<select v-model="a.place">
                <option value="current">На месте</option>
                <option value="home">Дома</option>
                <option value="work">На работе</option>
              </select></label
            >
          </div>
          <button @click="m.actions = m.actions.filter((x) => x.id !== a.id)">
            Убрать действие
          </button>
        </div>
        <button
          :disabled="!m.variables.length || m.actions.length >= 16"
          @click="addAction(m)"
        >
          Добавить действие
        </button>
        <p class="hint">
          Действие конкурирует с обычными делами NPC. Требуемый путь занимает
          время. Эффект применяется один раз после завершения, ограничивается
          диапазоном и изменяет только показатель своего модуля. Создание
          товаров и денег в этом формате не поддерживается.
        </p>
      </details>
      <p
        v-if="validity && !validity.success"
        class="mechanics-note"
        role="alert"
      >
        {{ validity.error.issues.map((i) => i.message).join(" · ") }}
      </p>
      <p v-if="error" role="alert">{{ error }}</p>
      <p class="hint">
        Версия формата и модулей сохраняется со снимком. Несовместимые версии и
        пропавшие значения отклоняются; старые снимки без дополнительных модулей
        получают совместимый системный адаптер. Новые сложные алгоритмы
        подключаются кодом через общий интерфейс, а не отдельным движком.
      </p>
    </template>
    <template v-else>
      <p v-if="!state">Создайте запуск для наблюдения.</p>
      <template v-else
        ><p>
          <strong>{{ actorName }}</strong> · действующие версии:
          {{ versions || "старый снимок" }}
        </p>
        <div class="mechanics-scroll">
          <table>
            <thead>
              <tr>
                <th>Показатель</th>
                <th>Сейчас</th>
                <th>Диапазон</th>
                <th>Изменение за минуту</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Сытость · системная</td>
                <td>{{ actor?.hunger }}</td>
                <td>0–1000</td>
                <td>По системным правилам питания</td>
              </tr>
              <tr>
                <td>Энергия · системная</td>
                <td>{{ actor?.energy }}</td>
                <td>0–1000</td>
                <td>Зависит от действия</td>
              </tr>
              <tr v-for="v in rows" :key="v.key">
                <td>
                  {{ v.name }} · {{ v.scope === "world" ? "мир" : actorName
                  }}<small>{{ v.module }}</small>
                </td>
                <td>{{ v.value }} {{ v.unit }}</td>
                <td>{{ v.min }}–{{ v.max }}</td>
                <td>{{ v.perMinute }} {{ v.unit }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <h4>Последние изменения</h4>
        <p class="hint">
          Последние записи выбранного NPC и мира, а не полный поминутный архив.
          Завершения действий модулей записываются в общий журнал.
        </p>
        <div class="mechanics-scroll">
          <table>
            <thead>
              <tr>
                <th>Время</th>
                <th>Показатель</th>
                <th>Изменение</th>
                <th>Причина</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(t, i) in traces" :key="i">
                <td>{{ formatWorldTime(t.minute) }}</td>
                <td>{{ title(t.variable) }}</td>
                <td>
                  {{ t.before }} → {{ t.after }} ({{ t.delta > 0 ? "+" : ""
                  }}{{ t.delta }})
                </td>
                <td>{{ rules[t.rule] ?? t.rule }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </template>
    </template>
  </details>
</template>
<style scoped>
.mechanics-panel {
  padding: 18px;
  margin-bottom: 18px;
  min-width: 0;
}
.mechanics-panel summary {
  font-weight: 700;
  cursor: pointer;
}
.mechanics-panel summary span {
  margin-left: 12px;
  font-size: 0.8em;
  color: #999;
}
.mechanics-panel p {
  line-height: 1.55;
  margin: 12px 0;
}
.mechanics-tabs,
.mechanics-toolbar {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  margin: 14px 0;
}
.mechanics-tabs .chosen {
  border-color: #d0a051;
  color: #e1ba75;
}
.mechanics-note {
  color: #e1b76f;
  border-left: 3px solid #d0a051;
  padding: 8px 12px;
}
.mechanics-system,
.mechanics-module,
.mechanics-action {
  border: 1px solid #ffffff18;
  padding: 14px;
  border-radius: 10px;
  margin: 14px 0;
}
.mechanics-module h4 {
  margin: 18px 0 12px;
}
.mechanics-fields {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 12px;
  margin: 14px 0;
}
.mechanics-fields label {
  display: grid;
  gap: 6px;
  font-size: 0.85rem;
}
.mechanics-fields input,
.mechanics-fields select {
  min-width: 0;
  width: 100%;
  padding: 8px;
  box-sizing: border-box;
}
.mechanics-fields .mechanics-enable {
  display: flex;
  align-items: center;
  gap: 8px;
}
.mechanics-enable input {
  width: auto;
}
.mechanics-scroll {
  overflow-x: auto;
  max-width: 100%;
  margin: 12px 0;
}
.mechanics-scroll table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.8rem;
  min-width: 600px;
}
.mechanics-scroll td,
.mechanics-scroll th {
  text-align: left;
  padding: 9px;
  border-bottom: 1px solid #ffffff12;
}
.mechanics-scroll th {
  color: #999;
}
.mechanics-scroll input {
  width: 80px;
  padding: 7px;
  box-sizing: border-box;
}
.mechanics-scroll td:first-child input {
  width: 160px;
  display: block;
  margin: 4px 0;
}
.mechanics-scroll small {
  display: block;
  color: #999;
  margin-top: 5px;
}
.mechanics-scroll select {
  padding: 7px;
  max-width: 140px;
}
@media (max-width: 600px) {
  .mechanics-panel {
    padding: 12px;
  }
  .mechanics-module,
  .mechanics-action {
    padding: 10px;
  }
  .mechanics-fields {
    grid-template-columns: 1fr 1fr;
    gap: 10px;
  }
  .mechanics-fields label {
    font-size: 0.75rem;
  }
}
</style>
