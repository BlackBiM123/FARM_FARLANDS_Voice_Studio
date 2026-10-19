<script setup lang="ts">
import { computed } from "vue";
import { formatWorldTime } from "../world-runs";
import { requestStages, type LifeDefinition } from "../../shared/life";
import type { WorldDefinition, WorldState } from "../../shared/world";
const model = defineModel<LifeDefinition>();
const emit = defineEmits<{ cause: [id: string] }>();
const props = defineProps<{
  world: WorldDefinition;
  currentWorld?: WorldDefinition;
  state?: WorldState;
  actor?: string;
}>();
const current = computed(() => props.currentWorld ?? props.world),
  who = computed(() => props.actor ?? current.value.agents[0]?.id ?? ""),
  npc = computed(() => current.value.agents.find((a) => a.id === who.value)),
  life = computed(() => props.state?.life);
const axes = {
  affinity: "Симпатия",
  trust: "Доверие",
  respect: "Уважение",
  attachment: "Привязанность",
};
const statuses = {
  active: "В работе",
  completed: "Выполнено",
  expired: "Срок истёк",
};
function create() {
  model.value = {
    version: 1,
    enabled: false,
    socialDelta: { affinity: 1, trust: 0, respect: 0, attachment: 0 },
    initialRelations: [],
    requests: [],
  };
}
function relation() {
  if (!model.value || props.world.agents.length < 2) return;
  model.value.initialRelations.push({
    from: props.world.agents[0]!.id,
    to: props.world.agents[1]!.id,
    scores: { affinity: 0, trust: 0, respect: 0, attachment: 0 },
  });
}
function request() {
  if (!model.value || props.world.agents.length < 3) return;
  let i = 1;
  while (model.value.requests.some((r) => r.id === "request_" + i)) i++;
  model.value.requests.push({
    id: "request_" + i,
    name: "Просьба о встрече " + i,
    issuer: props.world.agents[0]!.id,
    actor: props.world.agents[1]!.id,
    target: props.world.agents[2]!.id,
    deadlineMinutes: 4320,
    priority: 50,
    stages: [
      {
        id: "meet_target",
        kind: "conversation",
        with: "target",
        label: "Поговорить с нужным NPC",
      },
      {
        id: "report_back",
        kind: "conversation",
        with: "issuer",
        label: "Вернуться и доложить просителю",
      },
    ],
  });
}
type Request = LifeDefinition["requests"][number];
function addStage(r: Request) {
  r.stages ??= requestStages(r).map((s) => ({ ...s }));
  let i = 1;
  while (r.stages.some((s) => s.id === "stage_" + i)) i++;
  r.stages.push({
    id: "stage_" + i,
    kind: "conversation",
    with: "issuer",
    label: "Новый этап",
  });
}
function moveStage(r: Request, index: number, direction: number) {
  if (!r.stages) return;
  const [step] = r.stages.splice(index, 1);
  r.stages.splice(index + direction, 0, step!);
}
function planFor(id: string) {
  const r = current.value.life?.requests.find((r) => r.id === id);
  return r ? requestStages(r) : [];
}
const name = (id: string) =>
  current.value.agents.find((a) => a.id === id)?.name ?? id;
const place = (id: string | undefined) =>
  current.value.places.find((p) => p.id === id)?.name ?? id ?? "";
const material = computed(() => {
  if (!props.state || !npc.value) return;
  const account = npc.value.account,
    cash = props.state.accounts[account] ?? 0,
    debt = (props.state.obligations ?? [])
      .filter((d) => d.from === account)
      .reduce((s, d) => s + d.remaining, 0),
    owed = (props.state.obligations ?? [])
      .filter((d) => d.to === account)
      .reduce((s, d) => s + d.remaining, 0);
  return {
    cash,
    debt,
    owed,
    free: Math.max(0, cash - debt),
    change:
      cash -
      (current.value.accounts.find((a) => a.id === account)?.balance ?? 0),
    property: Object.entries(props.state.owners)
      .filter(([, owner]) => owner === account)
      .map(
        ([place]) =>
          current.value.places.find((p) => p.id === place)?.name ?? place,
      ),
  };
});
</script>
<template>
  <details class="panel life-panel">
    <summary>Жизнь NPC · отношения, цели, просьбы и перемены</summary>
    <p class="life-note">
      Отдельный сохраняемый слой причин и последствий. По умолчанию выключен.
      Родственные связи и авторские анкеты не превращаются в придуманные
      числовые отношения. Нет автоматических наград, штрафов за просрочку или
      выселения.
    </p>
    <button v-if="!model" @click="create">Настроить жизненный слой</button>
    <template v-else
      ><label class="life-toggle"
        ><input v-model="model.enabled" type="checkbox" />Включить жизненный
        слой в следующий запуск</label
      >
      <p class="life-note">
        Изменения применяются через «Сохранить мир» и «Новый запуск». Текущий
        запуск и прежние снимки используют собственные правила.
      </p>
      <details>
        <summary>Эффект завершённого разговора</summary>
        <div class="life-axes">
          <label v-for="(label, key) in axes" :key="key"
            >{{ label
            }}<input
              v-model.number="model.socialDelta[key]"
              type="number"
              min="-100"
              max="100"
          /></label>
        </div>
        <p>
          Изменение применяется один раз к каждой стороне реального разговора.
          Направленные значения хранятся отдельно, в диапазоне −100…100.
          Романтический статус из этих чисел автоматически не следует.
        </p>
      </details>
      <details>
        <summary>
          Начальные направленные отношения · {{ model.initialRelations.length }}
        </summary>
        <div
          v-for="(r, i) in model.initialRelations"
          :key="i"
          class="life-card"
        >
          <div class="life-fields">
            <label
              >От кого<select v-model="r.from">
                <option v-for="a in world.agents" :key="a.id" :value="a.id">
                  {{ a.name }}
                </option>
              </select></label
            ><label
              >К кому<select v-model="r.to">
                <option v-for="a in world.agents" :key="a.id" :value="a.id">
                  {{ a.name }}
                </option>
              </select></label
            >
          </div>
          <div class="life-axes">
            <label v-for="(label, key) in axes" :key="key"
              >{{ label
              }}<input
                v-model.number="r.scores[key]"
                type="number"
                min="-100"
                max="100"
            /></label>
          </div>
          <button @click="model.initialRelations.splice(i, 1)">
            Удалить связь из черновика
          </button>
        </div>
        <button
          :disabled="
            world.agents.length < 2 || model.initialRelations.length >= 1000
          "
          @click="relation"
        >
          Добавить направленную связь
        </button>
      </details>
      <details>
        <summary>Просьбы о встрече · {{ model.requests.length }}</summary>
        <p class="life-note">
          Проситель должен сначала поговорить с исполнителем. После этого
          исполнитель вечером старается встретить указанного NPC в таверне.
          Собеседник должен действительно прийти и быть свободен. Простой вход в
          место не выполняет этап: нужен завершённый разговор до общего срока.
          Новая просьба требует встречи и отдельного доклада. Старые просьбы
          остаются одноэтапными, пока их явно не изменят. Поддержаны до восьми
          этапов разговора; предметные действия и награды пока не подключены.
        </p>
        <div v-for="(r, i) in model.requests" :key="r.id" class="life-card">
          <label
            >Название просьбы<input v-model="r.name" maxlength="120"
          /></label>
          <div class="life-fields">
            <label
              >Кто просит<select v-model="r.issuer">
                <option v-for="a in world.agents" :key="a.id" :value="a.id">
                  {{ a.name }}
                </option>
              </select></label
            ><label
              >Кто выполняет<select v-model="r.actor">
                <option v-for="a in world.agents" :key="a.id" :value="a.id">
                  {{ a.name }}
                </option>
              </select></label
            ><label
              >С кем встретиться<select v-model="r.target">
                <option v-for="a in world.agents" :key="a.id" :value="a.id">
                  {{ a.name }}
                </option>
              </select></label
            ><label
              >Срок после принятия, мин<input
                v-model.number="r.deadlineMinutes"
                type="number"
                min="1"
                max="43200" /></label
            ><label
              >Приоритет, 1–119<input
                v-model.number="r.priority"
                type="number"
                min="1"
                max="119"
            /></label>
          </div>
          <h4>Последовательность этапов</h4>
          <p v-if="!r.stages" class="life-note">
            Прежняя просьба с одним этапом. Новые этапы не добавляются
            автоматически.
          </p>
          <div v-for="(s, n) in r.stages" :key="s.id" class="life-stage">
            <div class="life-fields">
              <label
                >Название этапа<input
                  v-model="s.label"
                  maxlength="120" /></label
              ><label
                >Завершённый разговор с<select v-model="s.with">
                  <option value="target">Нужным NPC</option>
                  <option value="issuer">Просителем</option>
                </select></label
              >
            </div>
            <div class="life-stage-actions">
              <button :disabled="n === 0" @click="moveStage(r, n, -1)">
                Выше</button
              ><button
                :disabled="n === r.stages!.length - 1"
                @click="moveStage(r, n, 1)"
              >
                Ниже</button
              ><button
                :disabled="r.stages!.length === 1"
                @click="r.stages!.splice(n, 1)"
              >
                Удалить этап
              </button>
            </div>
          </div>
          <button :disabled="(r.stages?.length ?? 1) >= 8" @click="addStage(r)">
            Добавить этап
          </button>
          <button @click="model.requests.splice(i, 1)">
            Удалить просьбу из черновика
          </button>
        </div>
        <button
          :disabled="world.agents.length < 3 || model.requests.length >= 64"
          @click="request"
        >
          Добавить просьбу о встрече
        </button>
      </details>
    </template>
    <section v-if="state && npc" class="life-observe">
      <h3>Сейчас: {{ npc.name }}</h3>
      <div v-if="material" class="life-material">
        <p>
          Деньги <strong>{{ material.cash }}</strong> · изменение с начала
          <strong
            >{{ material.change > 0 ? "+" : "" }}{{ material.change }}</strong
          >
        </p>
        <p>
          Свободно после долгов {{ material.free }} · должен
          {{ material.debt }} · ему должны {{ material.owed }}
        </p>
        <p>
          Имущество:
          {{
            material.property.join(", ") ||
            "нет зарегистрированной собственности"
          }}
        </p>
      </div>
      <p v-if="!life" class="life-note">
        В этом запуске жизненный слой выключен. Денежные показатели выше
        рассчитаны по действующим счетам и обязательствам.
      </p>
      <template v-else
        ><h4>Направленные отношения</h4>
        <div class="life-scroll">
          <table>
            <thead>
              <tr>
                <th>К кому</th>
                <th v-for="label in axes" :key="label">{{ label }}</th>
                <th>Причина</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(r, other) in life.relations[who]" :key="other">
                <td>{{ name(String(other)) }}</td>
                <td v-for="(_, key) in axes" :key="key">{{ r[key] }}</td>
                <td>
                  <button v-if="r.cause" @click="emit('cause', r.cause)">
                    Показать причину</button
                  ><template v-else>Начальные значения</template>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <p v-if="!Object.keys(life.relations[who] ?? {}).length">
          Пока нет заданных или пережитых отношений.
        </p>
        <h4>Личные цели</h4>
        <p v-for="(g, id) in life.goals[who]" :key="id">
          {{
            g.kind === "housing" ? "Собственное жильё" : "Погасить личные долги"
          }}
          · <strong>{{ statuses[g.status] }}</strong
          ><template v-if="g.amount !== undefined">
            · остаток {{ g.amount }}</template
          ><small
            >{{ formatWorldTime(g.updated) }} ·
            <button v-if="g.cause" @click="emit('cause', g.cause)">
              Показать причину</button
            ><template v-else>Начальные условия</template></small
          >
        </p>
        <h4>Просьбы и условия</h4>
        <div v-for="(q, id) in life.quests" :key="id">
          <p v-if="q.actor === who || q.issuer === who">
            <strong>{{
              current.life?.requests.find((r) => r.id === id)?.name ?? id
            }}</strong>
            · {{ statuses[q.status] }}<br />{{ name(q.issuer) }} →
            {{ name(q.actor) }} · встретить {{ name(q.target)
            }}<small
              >Срок: {{ formatWorldTime(q.deadline) }} ·
              <button @click="emit('cause', q.cause)">
                Показать причину
              </button></small
            >
          </p>
          <ol
            v-if="(q.actor === who || q.issuer === who) && q.stages"
            class="life-stage-list"
          >
            <li
              v-for="(s, n) in q.stages"
              :key="s.id"
              :data-current="q.status === 'active' && q.cursor === n"
            >
              <strong>{{ planFor(String(id))[n]?.label ?? s.id }}</strong> ·
              {{
                s.status === "completed"
                  ? "Завершён"
                  : q.status === "expired"
                    ? "Не выполнен до срока"
                    : q.cursor === n
                      ? "Текущий этап"
                      : "Ожидает предыдущих"
              }}<small v-if="s.completedAt !== undefined"
                >{{ formatWorldTime(s.completedAt) }} ·
                <button @click="emit('cause', s.cause)">
                  Событие завершения
                </button></small
              ><small v-else-if="q.status === 'active' && q.cursor === n"
                >Нужен реальный завершённый разговор с
                {{
                  name(
                    planFor(String(id))[n]?.with === "issuer"
                      ? q.issuer
                      : q.target,
                  )
                }}. Нужны вечер, путь, присутствие и согласие
                собеседника.</small
              >
            </li>
          </ol>
        </div>
        <details>
          <summary>
            Денежные изменения и переезды · {{ life.traces[who]?.length ?? 0 }}
          </summary>
          <p v-for="(t, i) in [...(life.traces[who] ?? [])].reverse()" :key="i">
            {{
              t.kind === "money"
                ? `Деньги: ${(t.delta ?? 0) > 0 ? "+" : ""}${t.delta}`
                : `Переезд: ${place(t.from)} → ${place(t.to)}`
            }}<small
              >{{ formatWorldTime(t.minute) }} ·
              <button @click="emit('cause', t.cause)">
                Показать причину
              </button></small
            >
          </p>
          <p class="life-note">
            Здесь последние 12 изменений; полная история остаётся в журнале.
            Богатство и бедность пока не делятся на придуманные классы. История
            переездов фиксирует только уже реализованную покупку и смену дома —
            перевозка мебели, аренда нового жилья и семейные переезды ещё не
            реализованы.
          </p>
        </details></template
      >
    </section>
  </details>
</template>
<style scoped>
.life-panel {
  padding: 20px;
}
.life-stage {
  margin: 12px 0;
  padding: 12px;
  border: 1px solid #ffffff18;
  border-radius: 8px;
}
.life-stage-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
.life-stage-list {
  padding-left: 22px;
  line-height: 1.7;
}
.life-stage-list li {
  padding: 12px;
  margin: 8px 0;
  background: #ffffff04;
}
.life-stage-list li[data-current="true"] {
  border-left: 3px solid #d3ad66;
}
.life-panel summary {
  cursor: pointer;
  line-height: 1.6;
}
.life-panel details {
  padding-top: 16px;
  margin: 16px 0;
  border-top: 1px solid #ffffff18;
}
.life-note {
  font-size: 0.82rem;
  line-height: 1.7;
  padding: 14px;
  background: #bda36b0b;
  border: 1px solid #bda36b25;
  border-radius: 8px;
  color: #b5afa5;
}
.life-toggle {
  display: flex;
  gap: 10px;
  align-items: center;
  margin: 18px 0;
}
.life-panel input[type="checkbox"] {
  width: 16px;
  height: 16px;
}
.life-card {
  border: 1px solid #ffffff1c;
  border-radius: 8px;
  padding: 16px;
  margin: 14px 0;
}
.life-fields,
.life-axes {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 12px;
  margin: 12px 0;
}
.life-panel label {
  font-size: 0.8rem;
}
.life-fields label,
.life-axes label,
.life-card > label {
  display: grid;
  gap: 6px;
}
.life-panel input,
.life-panel select {
  width: 100%;
  min-width: 0;
}
.life-panel small {
  display: block;
  color: #aaa;
  font-size: 0.72rem;
  margin-top: 5px;
}
.life-panel p {
  line-height: 1.7;
}
.life-observe {
  margin-top: 22px;
  border-top: 1px solid #ffffff18;
  padding-top: 16px;
}
.life-scroll {
  overflow: auto;
}
.life-panel table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.8rem;
}
.life-panel td,
.life-panel th {
  padding: 10px;
  text-align: left;
  border-bottom: 1px solid #ffffff18;
}
.life-material {
  padding: 10px 16px;
  background: #ffffff05;
  border-radius: 8px;
}
.life-panel h4 {
  margin-top: 24px;
}
</style>
