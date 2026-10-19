<script setup lang="ts">
import { computed, ref, shallowRef, onMounted, onUnmounted } from "vue";
import type { WorldDefinition, WorldEvent } from "../../shared/world";
import type { NPC } from "../../shared/schema";
import { createWorld, worldHash } from "../world-defaults";
import {
  parseReport,
  downloadWorld,
  formatWorldTime,
  checkWorld,
  type WorldReport,
} from "../world-runs";
import {
  experimentSchema,
  prepareExperiment,
  auditExperiment,
  experimentStore,
  parseExperimentResult,
  stable,
  checkNames,
  scenarioNames,
  type Experiment,
  type ExperimentResult,
} from "../experiments";
const props = defineProps<{ world?: WorldDefinition; npcs: NPC[] }>();
const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v));
function fresh(): Experiment {
  const world = clone(props.world ?? createWorld(props.npcs));
  return {
    version: 1,
    id: crypto.randomUUID(),
    name: "Новый эксперимент",
    minutes: 1440,
    scenario: "normal",
    participants: world.agents.map((a) => a.id),
    checks: ["money", "goods", "routes", "journal", "restore"],
    world,
  };
}
const config = ref<Experiment>(fresh()),
  presets = ref<Experiment[]>([]),
  results = shallowRef<ExperimentResult[]>([]),
  selected = shallowRef<ExperimentResult>(),
  compareId = ref("");
const tab = ref("setup"),
  error = ref(""),
  notice = ref(""),
  busy = ref(false),
  paused = ref(false),
  ready = ref(false),
  phase = ref("Загрузка ядра"),
  progress = ref(0),
  live = shallowRef<WorldReport>(),
  frame = ref<HTMLIFrameElement>(),
  file = ref<HTMLInputElement>();
const query = ref(""),
  eventActor = ref(""),
  eventKind = ref("");
let history: WorldEvent[] = [],
  sequence = 0,
  stop = false,
  disposed = false,
  wake: (() => void) | undefined,
  bootTimer: ReturnType<typeof setTimeout>;
const pending = new Map<
  number,
  {
    resolve: (r: WorldReport) => void;
    reject: (e: Error) => void;
    timer: ReturnType<typeof setTimeout>;
  }
>();
const visible = computed(() =>
  (selected.value?.report.archive ?? [])
    .filter(
      (e) =>
        (!eventActor.value ||
          e.actor === eventActor.value ||
          e.witnesses.includes(eventActor.value)) &&
        (!eventKind.value || e.type === eventKind.value) &&
        (!query.value ||
          e.text.toLowerCase().includes(query.value.toLowerCase())),
    )
    .slice(-100)
    .reverse(),
);
const comparison = computed(() =>
  results.value.find((r) => r.id === compareId.value),
);
const actorNames = computed(
  () =>
    new Map(
      (selected.value?.report.definition.agents ?? []).map((a) => [
        a.id,
        a.name,
      ]),
    ),
);
function receive(ev: MessageEvent) {
  if (
    ev.origin !== location.origin ||
    ev.source !== frame.value?.contentWindow ||
    ev.data?.channel !== "farlands-core"
  )
    return;
  if (ev.data.ready) {
    ready.value = true;
    phase.value = "Ядро готово";
    clearTimeout(bootTimer);
    return;
  }
  const p = pending.get(ev.data.requestId);
  if (!p) return;
  clearTimeout(p.timer);
  pending.delete(ev.data.requestId);
  try {
    if (ev.data.error) throw Error(ev.data.error);
    const r = parseReport(ev.data.report);
    for (const e of ev.data.events ?? []) {
      if (e.id !== `event_${history.length + 1}`)
        throw Error("Нарушен порядок журнала ядра");
      history.push(e);
    }
    if (checkWorld(r).length) throw Error(checkWorld(r).join("; "));
    p.resolve(r);
  } catch (e) {
    p.reject(e instanceof Error ? e : Error(String(e)));
  }
}
function command(action: string, data: Record<string, unknown> = {}) {
  return new Promise<WorldReport>((resolve, reject) => {
    const requestId = ++sequence;
    pending.set(requestId, {
      resolve,
      reject,
      timer: setTimeout(() => {
        pending.delete(requestId);
        reject(Error("Ядро не ответило за 60 секунд"));
      }, 60000),
    });
    frame.value?.contentWindow?.postMessage(
      { channel: "farlands-core", requestId, action, ...data },
      location.origin,
    );
  });
}
function makeReport(r: WorldReport): WorldReport {
  return { ...clone(r), archive: history.slice() };
}
async function persist(r: ExperimentResult) {
  try {
    results.value = await experimentStore("put", r);
  } catch (e) {
    notice.value =
      "Не удалось сохранить в браузере. Экспортируйте JSON до закрытия страницы.";
  }
}
async function run() {
  if (busy.value || !ready.value) return;
  error.value = "";
  notice.value = "";
  let e: Experiment;
  try {
    e = experimentSchema.parse(clone(config.value));
    prepareExperiment(e);
  } catch (err) {
    error.value =
      "Проверьте название, длительность, участников и выбранные проверки. " +
      String(err);
    return;
  }
  busy.value = true;
  paused.value = false;
  stop = false;
  progress.value = 0;
  tab.value = "run";
  selected.value = undefined;
  live.value = undefined;
  const id = crypto.randomUUID(),
    createdAt = new Date().toISOString(),
    started = performance.now();
  let current: WorldReport | undefined,
    mid: WorldReport | undefined,
    original: WorldReport | undefined,
    restored: boolean | undefined;
  const replay = e.checks.includes("restore"),
    half = Math.max(1, Math.floor(e.minutes / 2));
  function result(
    status: ExperimentResult["status"],
    reason?: string,
  ): ExperimentResult {
    return {
      version: 1,
      id,
      createdAt,
      experiment: e,
      status,
      error: reason,
      report: original ?? makeReport(current!),
      checks: auditExperiment(
        e,
        original ?? makeReport(current!),
        status === "complete" ? restored : undefined,
      ),
      elapsedMs: Math.round(performance.now() - started),
    };
  }
  async function pausePoint() {
    if (paused.value && !stop) {
      if (current) await persist(result("checkpoint"));
      await new Promise<void>((r) => {
        wake = r;
      });
      wake = undefined;
    }
  }
  async function advanceTo(target: number, start: number, span: number) {
    while (current!.state.minute < target && !stop && !disposed) {
      await pausePoint();
      if (stop || disposed) break;
      const amount = Math.min(60, target - current!.state.minute);
      current = await command("advance", { minutes: amount });
      live.value = current;
      progress.value =
        start +
        span *
          ((current.state.minute - 360 - (start === 50 ? half : 0)) /
            Math.max(1, e.minutes - (start === 50 ? half : 0)));
      if ((current.state.minute - 360) % 240 === 0)
        await persist(result("checkpoint"));
      await new Promise((r) => setTimeout(r, 0));
    }
  }
  try {
    const definition = prepareExperiment(e);
    history = [];
    phase.value = "Основной прогон";
    current = await command("start", {
      definition,
      contentHash: await worldHash(definition),
    });
    live.value = current;
    await advanceTo(360 + half, 0, replay ? 50 : 100);
    mid = makeReport(current);
    if (!stop) await advanceTo(360 + e.minutes, 0, replay ? 50 : 100);
    original = makeReport(current);
    if (replay && !stop && !disposed) {
      phase.value = "Проверка восстановления JSON на середине";
      history = mid.archive!.slice();
      current = await command("restore", { report: clone(mid) });
      await advanceTo(360 + e.minutes, 50, 50);
      if (!stop)
        restored =
          stable(current.state) === stable(original.state) &&
          stable(history) === stable(original.archive);
    }
    if (disposed) return;
    selected.value = result(stop ? "cancelled" : "complete");
    await persist(selected.value);
    progress.value = stop ? progress.value : 100;
    phase.value = stop ? "Остановлено пользователем" : "Прогон завершён";
    tab.value = "results";
  } catch (err) {
    error.value = String(err);
    phase.value = "Ошибка прогона";
    if (current && !disposed) {
      selected.value = result("error", String(err));
      await persist(selected.value);
      tab.value = "results";
    }
  } finally {
    busy.value = false;
    paused.value = false;
  }
}
function togglePause() {
  paused.value = !paused.value;
  if (!paused.value) wake?.();
}
function cancel() {
  stop = true;
  paused.value = false;
  wake?.();
}
function savePreset() {
  try {
    const e = experimentSchema.parse(clone(config.value));
    const next = [e, ...presets.value.filter((p) => p.id !== e.id)];
    localStorage.setItem("farlands-experiment-presets", JSON.stringify(next));
    presets.value = next;
    notice.value = "Сценарий сохранён в этом браузере вместе с копией мира.";
  } catch (e) {
    error.value = "Не удалось сохранить сценарий: " + String(e);
  }
}
function usePreset(e: Experiment) {
  config.value = clone(e);
  tab.value = "setup";
  notice.value = "Загружена зафиксированная копия мира из сценария.";
}
function removePreset(id: string) {
  const next = presets.value.filter((p) => p.id !== id);
  try {
    localStorage.setItem("farlands-experiment-presets", JSON.stringify(next));
    presets.value = next;
  } catch (e) {
    error.value = String(e);
  }
}
async function removeResult(id: string) {
  try {
    results.value = await experimentStore("delete", id);
    if (selected.value?.id === id) selected.value = undefined;
  } catch (e) {
    error.value = String(e);
  }
}
async function importFile(ev: Event) {
  const f = (ev.target as HTMLInputElement).files?.[0];
  if (!f) return;
  try {
    if (f.size > 100_000_000) throw Error("Максимум 100 МБ");
    const raw = JSON.parse(await f.text());
    if (raw.report) {
      const r = parseExperimentResult(raw);
      selected.value = r;
      await persist(r);
      tab.value = "results";
      notice.value =
        "Отчёт импортирован. Инварианты пересчитаны; восстановление требует нового прогона.";
    } else {
      config.value = experimentSchema.parse(raw);
      tab.value = "setup";
      notice.value =
        "Сценарий импортирован. Для сохранения нажмите «Сохранить сценарий».";
    }
  } catch (e) {
    error.value = "Импорт отклонён: " + String(e);
  } finally {
    (ev.target as HTMLInputElement).value = "";
  }
}
function reset() {
  config.value = fresh();
  notice.value =
    "Взята текущая сохранённая конфигурация мира. Несохранённые правки другой страницы сюда не входят.";
}
function duplicate() {
  config.value.id = crypto.randomUUID();
}
function exportPreset() {
  try {
    downloadWorld(
      experimentSchema.parse(clone(config.value)),
      "farlands-experiment.json",
    );
  } catch (e) {
    error.value = "Сначала исправьте настройки сценария: " + String(e);
  }
}
function metric(r: ExperimentResult, key: string) {
  return (metrics(r) as Record<string, number>)[key];
}
const metrics = (r: ExperimentResult) => ({
  events: r.report.archive?.length ?? 0,
  hungry: Object.values(r.report.state.agents).filter((a) => a.hunger < 150)
    .length,
  exhausted: Object.values(r.report.state.agents).filter((a) => a.energy < 100)
    .length,
  money: Object.values(r.report.state.accounts).reduce((s, n) => s + n, 0),
});
function beforeUnload(ev: BeforeUnloadEvent) {
  if (busy.value) {
    ev.preventDefault();
    ev.returnValue = "";
  }
}
const actionNames: Record<string, string> = {
  idle: "Свободное время",
  work: "Работа",
  travel: "В пути",
  rest: "Отдых",
  eat: "Еда",
  mechanic: "Действие модуля",
  social: "Разговор",
  meet: "Поиск собеседника",
  buy: "Покупка дома",
  pickup: "Погрузка",
  import_pickup: "Погрузка на рынке",
  deliver: "Разгрузка",
  return_cargo: "Возврат груза",
};
function place(r: ExperimentResult, id: string) {
  return r.report.definition.places.find((p) => p.id === id)?.name ?? id;
}
const comparedAgents = computed(() => [
  ...new Set([
    ...Object.keys(selected.value?.report.state.agents ?? {}),
    ...Object.keys(comparison.value?.report.state.agents ?? {}),
  ]),
]);
onMounted(async () => {
  addEventListener("message", receive);
  addEventListener("beforeunload", beforeUnload);
  bootTimer = setTimeout(() => {
    if (!ready.value)
      error.value =
        "Не удалось загрузить ядро. Перезагрузите страницу и проверьте WebGL 2.";
  }, 45000);
  try {
    const raw = JSON.parse(
      localStorage.getItem("farlands-experiment-presets") ?? "[]",
    );
    presets.value = raw.map((e: unknown) => experimentSchema.parse(e));
    results.value = await experimentStore("list");
  } catch (e) {
    error.value = "Не удалось прочитать локальные эксперименты: " + String(e);
  }
});
onUnmounted(() => {
  disposed = true;
  cancel();
  clearTimeout(bootTimer);
  removeEventListener("message", receive);
  removeEventListener("beforeunload", beforeUnload);
  for (const p of pending.values()) {
    clearTimeout(p.timer);
    p.reject(Error("Страница закрыта"));
  }
  pending.clear();
});
</script>
<template>
  <section class="experiment-lab">
    <header class="lab-heading">
      <div>
        <span class="eyebrow">КОНТРОЛЬ ПРЕДСКАЗУЕМОСТИ</span>
        <h2>Проверки симуляции</h2>
        <p>
          Настройте эксперимент → запустите → проверьте результат → сравните
          изменения.
        </p>
      </div>
      <a href="/guide?chapter=experiments">Как пользоваться</a>
    </header>
    <p class="lab-note">
      Отдельное настоящее ядро Godot. Анкеты, облачный проект и текущий запуск
      лаборатории не изменяются. Сценарии и отчёты хранятся в этом браузере; для
      переноса используйте JSON. При уходе со страницы расчёт остановится.
    </p>
    <div class="lab-tabs">
      <button
        v-for="t in [
          ['setup', '1 · Настройка'],
          ['run', '2 · Прогон'],
          ['results', '3 · Отчёты'],
          ['compare', '4 · Сравнение'],
        ]"
        :key="t[0]"
        :class="{ chosen: tab === t[0] }"
        @click="tab = t[0]!"
      >
        {{ t[1] }}</button
      ><span role="status">{{
        ready ? "Ядро проверок готово" : "Загрузка ядра…"
      }}</span>
    </div>
    <p v-if="error" class="lab-error" role="alert">{{ error }}</p>
    <p v-if="notice" class="lab-note" role="status">{{ notice }}</p>
    <div v-if="tab === 'setup'" class="lab-layout">
      <aside class="panel">
        <h3>Сохранённые сценарии</h3>
        <p v-if="!presets.length">
          Пока пусто. Настройте первый эксперимент справа.
        </p>
        <div v-for="p in presets" :key="p.id" class="lab-saved">
          <button :disabled="busy" @click="usePreset(p)">
            {{ p.name
            }}<small
              >{{ p.participants.length }} NPC · {{ p.minutes }} мин</small
            ></button
          ><button
            :disabled="busy"
            aria-label="Удалить сценарий"
            @click="removePreset(p.id)"
          >
            ×
          </button>
        </div>
        <button :disabled="busy" @click="reset">Взять текущий мир</button
        ><button
          :disabled="busy"
          @click="
            duplicate();
            config.name += ' · копия';
          "
        >
          Создать копию сценария</button
        ><button :disabled="busy" @click="file?.click()">Импорт JSON</button>
      </aside>
      <div class="panel">
        <fieldset :disabled="busy">
          <legend>Что запускаем</legend>
          <div class="lab-fields">
            <label
              >Название<input v-model="config.name" maxlength="120" /></label
            ><label
              >Условия<select v-model="config.scenario" aria-label="Условия">
                <option v-for="(n, k) in scenarioNames" :key="k" :value="k">
                  {{ n }}
                </option>
              </select></label
            ><label
              >Игровых минут<input
                v-model.number="config.minutes"
                type="number"
                min="1"
                max="43200" /></label
            ><label
              >Seed мира<input
                v-model.number="config.world.seed"
                type="number"
                min="0"
                max="10000000"
            /></label>
          </div>
          <div class="lab-actions">
            <button
              v-for="[label, m] in [
                ['Час', 60],
                ['День', 1440],
                ['Неделя', 10080],
                ['Месяц', 43200],
              ]"
              :key="label"
              @click="config.minutes = Number(m)"
            >
              {{ label }}
            </button>
          </div>
          <p class="lab-note">
            «Нет еды» обнуляет начальные запасы текущего пищевого товара;
            производство позже может создать новый. «Нет денег» обнуляет личные
            счета выбранных NPC; будущие доходы остаются. Закрытые дороги не
            мешают действиям внутри одного места.
          </p>
          <details>
            <summary>
              Участники · {{ config.participants.length }} /
              {{ config.world.agents.length }}
            </summary>
            <div class="lab-actions">
              <button
                @click="
                  config.participants = config.world.agents.map((a) => a.id)
                "
              >
                Выбрать всех</button
              ><button @click="config.participants = []">Снять выбор</button>
            </div>
            <div class="lab-roster">
              <label v-for="a in config.world.agents" :key="a.id"
                ><input
                  v-model="config.participants"
                  type="checkbox"
                  :value="a.id"
                />{{ a.name }}<small>{{ a.role }}</small></label
              >
            </div>
            <p class="lab-note">
              Счета и запасы невыбранных участников остаются в мире. Это не
              удаление персонажей.
            </p>
          </details>
          <details>
            <summary>Исходные ресурсы копии мира</summary>
            <h4>Деньги</h4>
            <div
              class="lab-resource"
              v-for="a in config.world.accounts"
              :key="a.id"
            >
              <label
                >{{ a.name
                }}<input
                  v-model.number="a.balance"
                  type="number"
                  min="0"
                  max="10000000"
              /></label>
            </div>
            <h4>Запасы</h4>
            <div
              class="lab-resource"
              v-for="s in config.world.stocks"
              :key="s.id"
            >
              <label
                >{{ s.item }} · {{ s.place }} · {{ s.owner
                }}<input
                  v-model.number="s.amount"
                  type="number"
                  min="0"
                  max="10000000"
              /></label>
            </div>
          </details>
          <h3>Что проверяем</h3>
          <div class="lab-check-options">
            <label v-for="(n, k) in checkNames" :key="k"
              ><input v-model="config.checks" type="checkbox" :value="k" />{{
                n
              }}</label
            >
          </div>
          <p class="lab-note">
            Восстановление: основной прогон сохраняет JSON на середине, затем
            ядро повторяет вторую половину из этого снимка. Сравниваются все
            поля состояния и весь журнал. Это занимает дополнительное время.
            Дефицит еды — наблюдение, а не ошибка баланса.
          </p>
          <div class="lab-actions">
            <button @click="savePreset">Сохранить сценарий</button
            ><button @click="exportPreset">Экспорт сценария</button
            ><button
              class="lab-primary"
              :disabled="
                !ready || !config.participants.length || !config.checks.length
              "
              @click="run"
            >
              Запустить проверку
            </button>
          </div>
        </fieldset>
      </div>
    </div>
    <div v-if="tab === 'run'" class="panel">
      <h3>{{ phase }}</h3>
      <progress
        :value="progress"
        max="100"
        aria-label="Прогресс эксперимента"
      />
      <p>
        {{ Math.round(progress) }}%<template v-if="live">
          · {{ formatWorldTime(live.state.minute) }} ·
          {{ live.state.nextEvent - 1 }} событий ·
          {{ Object.keys(live.state.agents).length }} NPC</template
        >
      </p>
      <div class="lab-actions">
        <button v-if="busy" @click="togglePause">
          {{ paused ? "Продолжить" : "Пауза" }}</button
        ><button v-if="busy" @click="cancel">
          Остановить и сохранить частичный результат</button
        ><button v-if="!busy" @click="tab = selected ? 'results' : 'setup'">
          {{ selected ? "Открыть отчёт" : "К настройке" }}
        </button>
      </div>
      <p v-if="paused" class="lab-note">
        Пауза. Контрольная точка сохраняется отдельно в отчётах. Экспортируйте
        её, если закрываете страницу. После перезапуска страницы сценарий можно
        запустить заново; кнопка «Продолжить» действует в открытом прогоне.
      </p>
      <p>
        Прогресс измеряется игровыми минутами, а не прогнозом времени ожидания.
        Остановка и пауза срабатывают между шагами до 60 игровых минут.
        Промежуточные результаты сохраняются раз в 4 игровых часа.
      </p>
    </div>
    <div v-if="tab === 'results'" class="lab-layout">
      <aside class="panel">
        <h3>История прогонов</h3>
        <button :disabled="busy" @click="file?.click()">Импорт отчёта</button>
        <p v-if="!results.length">Запустите первый эксперимент.</p>
        <div v-for="r in results" :key="r.id" class="lab-saved">
          <button
            @click="
              selected = r;
              query = '';
              eventActor = '';
              eventKind = '';
            "
          >
            {{ r.experiment.name
            }}<small
              >{{ new Date(r.createdAt).toLocaleString("ru") }} ·
              {{
                r.status === "complete"
                  ? "завершён"
                  : r.status === "checkpoint"
                    ? "контрольная точка"
                    : r.status === "cancelled"
                      ? "остановлен"
                      : "ошибка"
              }}</small
            ></button
          ><button
            :disabled="busy"
            aria-label="Удалить отчёт"
            @click="removeResult(r.id)"
          >
            ×
          </button>
        </div>
      </aside>
      <div v-if="selected" class="panel lab-report">
        <h3>{{ selected.experiment.name }}</h3>
        <p
          class="lab-outcome"
          :data-failed="
            selected.status === 'error' ||
            selected.checks.some((c) => c.status === 'fail')
          "
        >
          {{
            selected.status === "complete"
              ? selected.checks.some((c) => c.status === "fail")
                ? "Есть нарушения"
                : "Прогон завершён"
              : selected.status === "error"
                ? "Прогон завершился ошибкой"
                : "Незавершённый эксперимент"
          }}
          · {{ selected.checks.filter((c) => c.status === "pass").length }} /
          {{ selected.checks.length }} проверок пройдено
        </p>
        <p>
          {{ scenarioNames[selected.experiment.scenario] }} ·
          {{ formatWorldTime(selected.report.state.minute) }} ·
          {{ Math.round(selected.elapsedMs / 1000) }} с
        </p>
        <p v-if="selected.status !== 'complete'" class="lab-note">
          Частичный результат. Проверки относятся только к рассчитанному
          отрезку; весь сценарий не завершён. {{ selected.error }}
        </p>
        <div class="lab-metrics">
          <div>
            <strong>{{ metrics(selected).events }}</strong
            >Событий
          </div>
          <div>
            <strong>{{ metrics(selected).hungry }}</strong
            >Критический голод
          </div>
          <div>
            <strong>{{ metrics(selected).exhausted }}</strong
            >Истощение
          </div>
          <div>
            <strong>{{ metrics(selected).money }}</strong
            >Всего денег
          </div>
        </div>
        <p class="lab-note">
          Голод и истощение показаны на конец прогона. Они не означают ошибку
          ядра и не являются проверкой устойчивости хозяйства.
        </p>
        <div
          v-for="c in selected.checks"
          :key="c.id"
          class="lab-check"
          :data-status="c.status"
        >
          <strong
            >{{
              c.status === "pass"
                ? "✓ Пройдено"
                : c.status === "fail"
                  ? "✕ Нарушение"
                  : "— Не проверено"
            }}
            · {{ c.name }}</strong
          >
          <p>{{ c.detail }}</p>
        </div>
        <div class="lab-actions">
          <button
            @click="downloadWorld(selected, 'farlands-experiment-report.json')"
          >
            Экспорт отчёта и полного журнала</button
          ><button
            @click="
              downloadWorld(selected.report, 'farlands-world-checkpoint.json')
            "
          >
            Снимок для страницы «Симуляция»</button
          ><button :disabled="busy" @click="usePreset(selected.experiment)">
            Повторить / изменить условия
          </button>
        </div>
        <details>
          <summary>Жители на конец прогона</summary>
          <div class="lab-scroll">
            <table>
              <thead>
                <tr>
                  <th>Персонаж</th>
                  <th>Сытость</th>
                  <th>Энергия</th>
                  <th>Действие</th>
                  <th>Место</th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="a in Object.values(selected.report.state.agents)"
                  :key="a.id"
                >
                  <td>{{ actorNames.get(a.id) }}</td>
                  <td>{{ Math.round(a.hunger / 10) }}%</td>
                  <td>{{ Math.round(a.energy / 10) }}%</td>
                  <td>
                    {{ actionNames[a.action.type] ?? a.action.type }}
                    <details>
                      <summary>Почему</summary>
                      <p>{{ a.reason }}</p>
                    </details>
                  </td>
                  <td>{{ place(selected, a.place) }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </details>
        <details>
          <summary>Журнал · последние 100 подходящих событий</summary>
          <div class="lab-fields">
            <label>Поиск<input v-model="query" /></label
            ><label
              >Персонаж<select v-model="eventActor">
                <option value="">Все</option>
                <option
                  v-for="a in selected.report.definition.agents"
                  :key="a.id"
                  :value="a.id"
                >
                  {{ a.name }}
                </option>
              </select></label
            ><label
              >Тип<select v-model="eventKind">
                <option value="">Все</option>
                <option
                  v-for="t in [
                    ...new Set(selected.report.archive?.map((e) => e.type)),
                  ].sort()"
                  :key="t"
                >
                  {{ t }}
                </option>
              </select></label
            >
          </div>
          <ol class="lab-events">
            <li v-for="e in visible" :key="e.id">
              <small
                >{{ formatWorldTime(e.minute) }} ·
                {{ actorNames.get(e.actor) ?? e.actor }} · {{ e.id }}</small
              >
              <p>{{ e.text }}</p>
            </li>
          </ol>
          <p v-if="!visible.length">Подходящих событий нет.</p>
        </details>
      </div>
      <div v-else class="panel">Выберите отчёт слева.</div>
    </div>
    <div v-if="tab === 'compare'" class="panel">
      <h3>Сравнение двух результатов</h3>
      <div class="lab-fields">
        <label
          >Первый прогон<select
            :value="selected?.id ?? ''"
            @change="
              selected = results.find(
                (r) => r.id === ($event.target as HTMLSelectElement).value,
              )
            "
          >
            <option value="">Выберите</option>
            <option v-for="r in results" :key="r.id" :value="r.id">
              {{ r.experiment.name }} · {{ r.createdAt }}
            </option>
          </select></label
        ><label
          >Второй прогон<select v-model="compareId">
            <option value="">Выберите</option>
            <option v-for="r in results" :key="r.id" :value="r.id">
              {{ r.experiment.name }} · {{ r.createdAt }}
            </option>
          </select></label
        >
      </div>
      <template v-if="selected && comparison"
        ><p class="lab-note">
          Это сравнение наблюдений, не доказательство причинности. Для чистого
          эксперимента меняйте один параметр при одинаковом составе, времени,
          версии ядра и правилах.
        </p>
        <div class="lab-scroll">
          <table>
            <thead>
              <tr>
                <th>Параметр</th>
                <th>Первый</th>
                <th>Второй</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Условия</td>
                <td>{{ scenarioNames[selected.experiment.scenario] }}</td>
                <td>{{ scenarioNames[comparison.experiment.scenario] }}</td>
              </tr>
              <tr>
                <td>Отпечаток определений</td>
                <td>{{ selected.report.contentHash.slice(0, 12) }}</td>
                <td>{{ comparison.report.contentHash.slice(0, 12) }}</td>
              </tr>
              <tr>
                <td>Версия правил</td>
                <td>{{ selected.report.rulesVersion }}</td>
                <td>{{ comparison.report.rulesVersion }}</td>
              </tr>
              <tr>
                <td>Seed</td>
                <td>{{ selected.report.definition.seed }}</td>
                <td>{{ comparison.report.definition.seed }}</td>
              </tr>
              <tr>
                <td>Участников</td>
                <td>{{ selected.report.definition.agents.length }}</td>
                <td>{{ comparison.report.definition.agents.length }}</td>
              </tr>
              <tr>
                <td>Рассчитано минут</td>
                <td>{{ selected.report.state.minute - 360 }}</td>
                <td>{{ comparison.report.state.minute - 360 }}</td>
              </tr>
              <tr
                v-for="[key, label] in [
                  ['events', 'Событий'],
                  ['hungry', 'Голодных'],
                  ['exhausted', 'Истощённых'],
                  ['money', 'Всего денег'],
                ]"
                :key="key"
              >
                <td>{{ label }}</td>
                <td>{{ metric(selected, key!) }}</td>
                <td>{{ metric(comparison, key!) }}</td>
              </tr>
              <tr>
                <td>Состояние</td>
                <td colspan="2">
                  {{
                    stable(selected.report.state) ===
                    stable(comparison.report.state)
                      ? "Совпадает полностью"
                      : "Есть различия"
                  }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <h4>Состояние каждого персонажа</h4>
        <div class="lab-scroll">
          <table>
            <thead>
              <tr>
                <th>Персонаж</th>
                <th>Первый: сытость / энергия</th>
                <th>Второй: сытость / энергия</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="id in comparedAgents" :key="id">
                <td>
                  {{
                    selected.report.definition.agents.find((a) => a.id === id)
                      ?.name ??
                    comparison.report.definition.agents.find((a) => a.id === id)
                      ?.name ??
                    id
                  }}
                </td>
                <td>
                  <template v-if="selected.report.state.agents[id]"
                    >{{
                      Math.round(selected.report.state.agents[id]!.hunger / 10)
                    }}% /
                    {{
                      Math.round(selected.report.state.agents[id]!.energy / 10)
                    }}%<br />{{
                      place(selected, selected.report.state.agents[id]!.place)
                    }}</template
                  ><template v-else>Не участвовал</template>
                </td>
                <td>
                  <template v-if="comparison.report.state.agents[id]"
                    >{{
                      Math.round(
                        comparison.report.state.agents[id]!.hunger / 10,
                      )
                    }}% /
                    {{
                      Math.round(
                        comparison.report.state.agents[id]!.energy / 10,
                      )
                    }}%<br />{{
                      place(
                        comparison,
                        comparison.report.state.agents[id]!.place,
                      )
                    }}</template
                  ><template v-else>Не участвовал</template>
                </td>
              </tr>
            </tbody>
          </table>
        </div></template
      >
    </div>
    <input
      ref="file"
      hidden
      type="file"
      accept="application/json,.json"
      @change="importFile"
    /><iframe
      ref="frame"
      src="/simulation/engine.html"
      title="Изолированное ядро проверок"
      class="lab-engine"
    />
  </section>
</template>
<style scoped>
.experiment-lab {
  max-width: 1500px;
  margin: 0 auto;
}
.lab-outcome {
  padding: 12px 16px;
  border: 1px solid #7dbb8c55;
  color: #b2d7b9;
  border-radius: 8px;
  line-height: 1.6;
}
.lab-outcome[data-failed="true"] {
  border-color: #cc7069;
  color: #eaa79d;
}
.lab-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  margin: 20px 0;
}
.lab-heading h2 {
  margin: 8px 0;
}
.lab-heading p {
  color: #aaa;
}
.lab-heading a {
  color: #e6bb70;
}
.lab-note {
  padding: 14px 16px;
  background: #d3a34d0b;
  border: 1px solid #ad8c4e33;
  border-radius: 9px;
  color: #b8b2a8;
  font-size: 0.83rem;
  line-height: 1.7;
  margin: 14px 0;
}
.lab-tabs,
.lab-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin: 14px 0;
}
.lab-tabs span {
  margin-left: auto;
  align-self: center;
  font-size: 0.8rem;
  color: #9ba791;
}
.chosen,
.lab-primary {
  border-color: #d4ae67 !important;
  color: #f3d293 !important;
}
.lab-layout {
  display: grid;
  grid-template-columns: 260px minmax(0, 1fr);
  gap: 20px;
}
.panel {
  padding: 22px;
  min-width: 0;
}
.panel h3 {
  margin: 0 0 16px;
}
.panel button {
  padding: 9px 12px;
}
.lab-saved {
  display: flex;
  gap: 6px;
  margin: 10px 0;
}
.lab-saved > button:first-child {
  flex: 1;
  text-align: left;
  min-width: 0;
  overflow-wrap: anywhere;
}
.lab-saved small {
  display: block;
  color: #999;
  font-size: 0.7rem;
  margin-top: 5px;
}
.lab-layout aside > button {
  margin: 6px 6px 6px 0;
}
.lab-fields {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: 14px;
}
.lab-fields label {
  display: grid;
  gap: 7px;
  font-size: 0.8rem;
}
.lab-fields input,
.lab-fields select {
  width: 100%;
  min-width: 0;
}
.experiment-lab fieldset {
  border: 0;
  padding: 0;
  margin: 0;
  min-width: 0;
}
.experiment-lab legend {
  font-weight: 600;
  margin-bottom: 18px;
}
.experiment-lab details {
  border-top: 1px solid #ffffff15;
  margin: 18px 0;
  padding-top: 16px;
}
.experiment-lab summary {
  cursor: pointer;
  line-height: 1.6;
}
.lab-roster {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 10px;
  margin: 16px 0;
}
.lab-roster label,
.lab-check-options label {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.85rem;
}
.lab-roster small {
  color: #999;
}
.experiment-lab input[type="checkbox"] {
  width: 16px;
  height: 16px;
  flex: none;
}
.lab-check-options {
  display: grid;
  gap: 12px;
}
.lab-resource label {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  font-size: 0.8rem;
  margin: 9px 0;
}
.lab-resource input {
  width: 100px;
}
.lab-error {
  padding: 15px;
  background: #9f393929;
  color: #ffb6ac;
  overflow-wrap: anywhere;
}
.experiment-lab progress {
  width: 100%;
  accent-color: #d1ae65;
}
.lab-metrics {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 12px;
  margin: 20px 0;
}
.lab-metrics > div {
  padding: 13px;
  background: #ffffff06;
  border-radius: 8px;
  font-size: 0.75rem;
  color: #aaa;
}
.lab-metrics strong {
  display: block;
  font-size: 1.4rem;
  color: #e4d5b5;
  margin-bottom: 8px;
}
.lab-check {
  border-left: 4px solid #849184;
  padding: 12px 16px;
  margin: 12px 0;
  background: #ffffff05;
}
.lab-check[data-status="pass"] {
  border-color: #74b38c;
}
.lab-check[data-status="fail"] {
  border-color: #e08072;
}
.lab-check[data-status="skip"] {
  border-color: #b79f6b;
}
.lab-check strong {
  font-size: 0.85rem;
}
.lab-check p {
  font-size: 0.8rem;
  line-height: 1.6;
  color: #b7b1a7;
  margin: 8px 0 0;
}
.lab-scroll {
  overflow: auto;
  max-width: 100%;
}
.experiment-lab table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.8rem;
}
.experiment-lab td,
.experiment-lab th {
  padding: 12px;
  text-align: left;
  border-bottom: 1px solid #ffffff15;
  overflow-wrap: anywhere;
}
.lab-events {
  padding-left: 22px;
}
.lab-events li {
  margin: 15px 0;
}
.lab-events small {
  color: #aaa;
}
.lab-events p {
  line-height: 1.6;
  margin: 5px 0;
  font-size: 0.85rem;
}
.lab-engine {
  position: absolute;
  width: 2px;
  height: 2px;
  opacity: 0;
  pointer-events: none;
  border: 0;
}
@media (max-width: 800px) {
  .lab-layout {
    grid-template-columns: 1fr;
  }
  .panel {
    padding: 16px;
  }
  .lab-heading {
    align-items: flex-start;
    flex-direction: column;
  }
  .lab-tabs span {
    width: 100%;
    margin-left: 0;
  }
  .lab-metrics {
    grid-template-columns: repeat(2, 1fr);
  }
  .lab-fields {
    grid-template-columns: 1fr 1fr;
  }
  .experiment-lab button {
    white-space: normal;
  }
  .experiment-lab td,
  .experiment-lab th {
    padding: 9px;
  }
}
</style>
