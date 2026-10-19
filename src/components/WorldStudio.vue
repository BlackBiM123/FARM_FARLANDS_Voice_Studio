<script setup lang="ts">
import JSZip from "jszip";
import NeedsPanel from "./NeedsPanel.vue";
import { computed, ref, watch, onMounted, onUnmounted } from "vue";
import { Play, Pause, Save, Download, Upload, Plus } from "lucide-vue-next";
import type { NPC } from "../../shared/schema";
import {
  worldSchema,
  type WorldDefinition,
  type WorldAgent,
  type WorldEvent,
} from "../../shared/world";
import { createWorld, worldHash } from "../world-defaults";
import {
  parseReport,
  saveLocalReport,
  loadLocalReport,
  downloadWorld,
  formatWorldTime,
  checkWorld,
  type WorldReport,
} from "../world-runs";
import { cloudRequest } from "../cloud-client";
import { prepareRoster } from "../world-roster";
import { appendJournal, readJournal, journalHash } from "../world-journal";
import { checkJournal, journalPageSchema } from "../../shared/journal";
let journalEvents: WorldEvent[] = [];
let journalId = crypto.randomUUID();
let journalStorageFailed = false;
const catalog = ref<
    { id: string; name: string; weight: number; baseValue: number }[]
  >([]),
  catalogQuery = ref("");
const catalogFiltered = computed(() =>
  catalog.value.filter((i) =>
    (i.name + " " + i.id)
      .toLowerCase()
      .includes(catalogQuery.value.toLowerCase()),
  ),
);
async function loadCatalog() {
  try {
    const r = await fetch("/simulation/item-catalog.json");
    catalog.value = (await r.json()).items;
  } catch {
    error.value = "Не удалось загрузить справочник игры";
  }
}
function useCatalogItem(item: {
  id: string;
  name: string;
  weight: number;
  baseValue: number;
}) {
  if (!draft.value.items.some((i) => i.id === item.id))
    draft.value.items.push({
      id: item.id,
      name: item.name,
      weight: item.weight,
      price: item.baseValue,
    });
}
const props = defineProps<{ npcs: NPC[]; page: string }>(),
  model = defineModel<WorldDefinition>();
const draft = ref<WorldDefinition>(
  JSON.parse(JSON.stringify(model.value ?? createWorld(props.npcs))),
);
const report = ref<WorldReport | null>(null),
  notice = ref(""),
  error = ref(""),
  selected = ref(draft.value.places[0]?.id ?? ""),
  reference = ref(false);
const ready = ref(false),
  loading = ref(false),
  busy = ref(false),
  playing = ref(false),
  speed = ref(15),
  engineFrame = ref<HTMLIFrameElement>(),
  engineSrc = ref("");
const imported = ref<HTMLInputElement>(),
  worldFile = ref<HTMLInputElement>(),
  eventQuery = ref(""),
  eventType = ref(""),
  eventActor = ref(""),
  selectedAgent = ref(""),
  tab = ref("accounts");
const pan = ref({ x: 0, y: 0 }),
  panning = ref<{ x: number; y: number; px: number; py: number } | null>(null);
const runs = ref<{ id: string; createdAt: string }[]>([]),
  cloudBusy = ref(false),
  zoom = ref(1),
  localAvailable = ref<WorldReport | null>(null);
const advanceCancelled = ref(false),
  advanceProgress = ref<{ done: number; total: number } | null>(null);
const runFinished = computed(() => (report.value?.state.minute ?? 0) >= 43560);
const localSaveState = ref<"none" | "saving" | "saved" | "failed">("none");
const finishedNotice =
  "Достигнут предел запуска: 30 дней. Сохраните отчёт или создайте новый запуск.";
const choice = computed(() =>
    draft.value.places.find((p) => p.id === selected.value),
  ),
  activeWorld = computed(() =>
    props.page === "simulation" && report.value
      ? report.value.definition
      : draft.value,
  );
const dirty = computed(
  () => JSON.stringify(draft.value) !== JSON.stringify(model.value),
);
const agents = computed(() =>
    report.value ? Object.values(report.value.state.agents) : [],
  ),
  inspect = computed(
    () => report.value?.state.agents[selectedAgent.value] ?? agents.value[0],
  );
const visibleEvents = computed(() =>
  (report.value ? journalEvents : [])
    .filter(
      (e) =>
        (!eventType.value || e.type === eventType.value) &&
        (!eventActor.value ||
          e.actor === eventActor.value ||
          e.witnesses.includes(eventActor.value)) &&
        (!eventQuery.value ||
          (e.text + " " + agentName(e.actor))
            .toLowerCase()
            .includes(eventQuery.value.toLowerCase())),
    )
    .slice(-100)
    .reverse(),
);
const checks = computed(() => (report.value ? checkWorld(report.value) : [])),
  valid = computed(() => worldSchema.safeParse(draft.value));
const alerts = computed(() => {
  if (!report.value) return [];
  const messages: string[] = [];
  for (const a of agents.value) {
    if (a.hunger < 150)
      messages.push(
        `${agentName(a.id)}: критический голод. Проверьте еду, личный счёт и дорогу к таверне.`,
      );
    if (a.energy < 100)
      messages.push(`${agentName(a.id)}: истощение. Проверьте доступ к дому.`);
    if (a.reason.startsWith("Нет открытого") || a.reason.startsWith("Место не"))
      messages.push(`${agentName(a.id)}: ${a.reason}`);
  }
  const p = report.value.definition.production;
  const source = report.value.definition.stocks.find(
    (s) => s.place === p.place && s.owner === p.owner && s.item === p.input,
  );
  if (!source || (report.value.state.stocks[source.id] ?? 0) < p.inputAmount)
    messages.push(
      "Производство ждёт сырьё. Изменения начальных запасов применяются в новом запуске.",
    );
  return messages;
});
const cargoWeight = computed(() =>
  inspect.value?.cargo
    ? inspect.value.cargo.amount *
      (activeWorld.value.items.find((i) => i.id === inspect.value.cargo?.item)
        ?.weight ?? 0)
    : 0,
);
const eventLabels: Record<string, string> = {
  plan_failed: "План изменился",
  obligation: "Начисление",
  decision: "Решение NPC",
  import: "Внешний рынок",
  start: "Начало",
  day: "Новый день",
  payment: "Оплата",
  travel: "В пути",
  arrive: "Прибытие",
  production: "Производство",
  delivery: "Перевозка",
  house: "Новый дом",
  eat: "Еда",
  social: "Разговор",
  blocked: "Нет ресурсов",
};
const actionLabels: Record<string, string> = {
  idle: "Свободное время",
  rest: "Отдых",
  work: "Работа",
  travel: "В пути",
  eat: "Еда",
  buy: "Покупка дома",
  pickup: "Погрузка",
  import_pickup: "Погрузка на внешнем рынке",
  deliver: "Разгрузка",
  return_cargo: "Возврат груза",
  meet: "Ищет собеседника",
  social: "Разговор",
};
function agentName(id: string) {
  return activeWorld.value.agents.find((n) => n.id === id)?.name ?? id;
}
function personalBalance(id: string) {
  const account = activeWorld.value.agents.find((a) => a.id === id)?.account;
  return account ? (report.value?.state.accounts[account] ?? 0) : 0;
}
const outstanding = computed(() =>
  (report.value?.state.obligations ?? []).filter((d) => d.remaining > 0),
);
const personalObligations = computed(() =>
  outstanding.value.filter((d) => d.actor === inspect.value?.id),
);
function transportPlan(a: WorldAgent) {
  const action = a.action;
  const pending = action.type === "travel" ? action.after : action;
  if (a.cargo)
    return {
      title:
        pending?.type === "return_cargo"
          ? "Возврат груза владельцу"
          : "Доставка груза получателю",
      phase: `${a.cargo.item} × ${a.cargo.amount} · ${action.type === "travel" ? "в пути" : "разгрузка"}`,
    };
  if (pending?.type === "import_pickup")
    return {
      title: "Поставка еды с причала",
      phase:
        action.type === "travel" ? "Идёт за закреплённым заказом" : "Погрузка",
    };
  if (pending?.type === "pickup")
    return {
      title: "Перевозка продукции фермы",
      phase:
        action.type === "travel" ? "Идёт за закреплённым заказом" : "Погрузка",
    };
  return null;
}
const transportPlans = computed(() =>
  agents.value
    .map((a) => ({ actor: a.id, plan: transportPlan(a) }))
    .filter((row) => row.plan),
);
function accountName(id: string) {
  return activeWorld.value.accounts.find((a) => a.id === id)?.name ?? id;
}
const housingPlan = computed(() => {
  if (
    !inspect.value ||
    !report.value ||
    !activeWorld.value.agents.find((a) => a.id === inspect.value?.id)?.goalHouse
  )
    return null;
  const a = inspect.value,
    price = activeWorld.value.house.price,
    account = activeWorld.value.agents.find((n) => n.id === a.id)?.account,
    reserved = outstanding.value
      .filter((d) => d.from === account)
      .reduce((sum, d) => sum + d.remaining, 0),
    balance = Math.max(0, personalBalance(a.id) - reserved);
  return {
    balance,
    reserved,
    price,
    remaining: Math.max(0, price - balance),
    progress: a.ownsHouse
      ? 100
      : Math.min(100, Math.round((100 * balance) / Math.max(1, price))),
    bought: a.ownsHouse,
  };
});
function placeName(id: string) {
  return activeWorld.value.places.find((n) => n.id === id)?.name ?? id;
}
function point(id: string) {
  return activeWorld.value.places.find((p) => p.id === id) ?? { x: 0, y: 0 };
}
function avatar(id: string) {
  return props.npcs.find((n) => n.id === id)?.photo;
}
function commit() {
  if (draft.value.agents.some((a) => !props.npcs.some((n) => n.id === a.id))) {
    error.value = "Участник мира отсутствует в каталоге NPC";
    return;
  }
  if (!valid.value.success) {
    error.value = valid.value.error.issues[0]?.message ?? "Проверьте поля";
    return;
  }
  draft.value.revision = (model.value?.revision ?? 0) + 1;
  model.value = worldSchema.parse(JSON.parse(JSON.stringify(draft.value)));
  notice.value = "Определения сохранены. Состояния запусков отделены от анкет.";
  error.value = "";
}
watch(model, (value) => {
  if (value) draft.value = JSON.parse(JSON.stringify(value));
});
async function exportGodotWorld() {
  if (!valid.value.success) {
    error.value = "Проверьте определения";
    return;
  }
  try {
    const zip = new JSZip();
    zip.file("world/definition.json", JSON.stringify(valid.value.data));
    zip.file(
      "world/manifest.json",
      JSON.stringify(
        {
          version: 1,
          contentHash: await worldHash(valid.value.data),
          coreVersion: "farlands-core-1",
        },
        null,
        2,
      ),
    );
    for (const file of ["world_core.gd"]) {
      const r = await fetch("/simulation/source/" + file);
      if (!r.ok) throw Error("Нет исходника ядра");
      zip.file("addons/farlands_world/" + file, await r.text());
    }
    for (const file of [
      "world_service.gd",
      "world_actor.gd",
      "world_lab.gd",
      "world_lab.tscn",
      "README.md",
    ]) {
      const r = await fetch("/simulation/integration/" + file);
      if (!r.ok) throw Error("Нет адаптера");
      zip.file("addons/farlands_world/" + file, await r.text());
    }
    const blob = await zip.generateAsync({ type: "blob" }),
      url = URL.createObjectURL(blob),
      a = document.createElement("a");
    a.href = url;
    a.download = "farlands-world-godot.zip";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch (e) {
    error.value = String(e);
  }
}
function addPlace() {
  const id = "place_" + crypto.randomUUID().slice(0, 8);
  draft.value.places.push({
    id,
    name: "Новое место",
    scene: 6,
    x: 750,
    y: 450,
    kind: "home",
    exists: true,
    godotPath: "",
  });
  selected.value = id;
}
function addRoute() {
  const p = draft.value.places;
  if (p.length > 1)
    draft.value.routes.push({
      id: "route_" + crypto.randomUUID().slice(0, 8),
      from: p[0]!.id,
      to: p[1]!.id,
      minutes: 10,
      mode: "walk",
      open: true,
    });
}
function addAgent() {
  const n = props.npcs.find(
      (n) => !draft.value.agents.some((a) => a.id === n.id),
    ),
    p = draft.value.places[0];
  if (!n || !p) return;
  const account = "wallet_" + n.id.slice(0, 50);
  if (!draft.value.accounts.some((a) => a.id === account))
    draft.value.accounts.push({
      id: account,
      name: n.name + " · личные",
      balance: 50,
    });
  draft.value.agents.push({
    id: n.id,
    name: n.name,
    home: p.id,
    work: p.id,
    account,
    employer: account,
    wage: 0,
    rent: 0,
    role: "resident",
    goalHouse: false,
    helpfulness: 50,
  });
}
function prepareAll() {
  try {
    draft.value = prepareRoster(draft.value, props.npcs);
    notice.value =
      "Состав подготовлен в черновике. Новые параметры помечены как тестовые; проверьте привязки и сохраните мир.";
  } catch (e) {
    error.value = String(e);
  }
}
function addAccount() {
  draft.value.accounts.push({
    id: "account_" + crypto.randomUUID().slice(0, 8),
    name: "Новый счёт",
    balance: 0,
  });
}
function detachAgent(id: string) {
  draft.value.agents = draft.value.agents.filter((a) => a.id !== id);
}
function addItem() {
  draft.value.items.push({
    id: "item_" + crypto.randomUUID().slice(0, 8),
    name: "Новый товар",
    weight: 1,
    price: 1,
  });
}
function addStock() {
  if (draft.value.items[0] && draft.value.accounts[0])
    draft.value.stocks.push({
      id: "stock_" + crypto.randomUUID().slice(0, 8),
      place: draft.value.places[0]!.id,
      owner: draft.value.accounts[0].id,
      item: draft.value.items[0].id,
      amount: 0,
    });
}
function deletePlace() {
  const p = choice.value,
    w = draft.value;
  if (!p) return;
  if (
    w.agents.some((a) => a.home === p.id || a.work === p.id) ||
    w.stocks.some((s) => s.place === p.id) ||
    w.house.place === p.id ||
    w.production.place === p.id
  ) {
    error.value =
      "Сначала переназначьте NPC, запасы, дом и производство этого места.";
    return;
  }
  w.routes = w.routes.filter((r) => r.from !== p.id && r.to !== p.id);
  w.places = w.places.filter((x) => x.id !== p.id);
  selected.value = w.places[0]?.id ?? "";
}
let drag: { id: string; x: number; y: number; px: number; py: number } | null =
  null;
function down(event: PointerEvent, id: string) {
  const p = draft.value.places.find((x) => x.id === id);
  if (!p) return;
  selected.value = id;
  drag = { id, x: p.x, y: p.y, px: event.clientX, py: event.clientY };
  (event.currentTarget as Element).setPointerCapture(event.pointerId);
}
function panDown(event: PointerEvent) {
  panning.value = { ...pan.value, px: event.clientX, py: event.clientY };
  (event.currentTarget as Element).setPointerCapture(event.pointerId);
}
function move(event: PointerEvent) {
  if (panning.value) {
    const r = (event.currentTarget as Element).getBoundingClientRect(),
      p = panning.value;
    pan.value = {
      x: Math.max(
        0,
        Math.min(
          1000 - 1000 / zoom.value,
          p.x - ((event.clientX - p.px) * 1000) / r.width / zoom.value,
        ),
      ),
      y: Math.max(
        0,
        Math.min(
          1000 - 1000 / zoom.value,
          p.y - ((event.clientY - p.py) * 1000) / r.height / zoom.value,
        ),
      ),
    };
    return;
  }
  if (!drag) return;
  const r = (event.currentTarget as Element)
      .closest("svg")!
      .getBoundingClientRect(),
    p = draft.value.places.find((p) => p.id === drag!.id)!;
  p.x = Math.round(
    Math.max(
      15,
      Math.min(
        985,
        drag.x + ((event.clientX - drag.px) * 1000) / r.width / zoom.value,
      ),
    ),
  );
  p.y = Math.round(
    Math.max(
      15,
      Math.min(
        985,
        drag.y + ((event.clientY - drag.py) * 1000) / r.height / zoom.value,
      ),
    ),
  );
  p.scene = Math.min(9, Math.floor(p.y / 334) * 3 + Math.floor(p.x / 334) + 1);
}
const pending = new Map<
  number,
  {
    resolve: (r: WorldReport) => void;
    reject: (e: Error) => void;
    timer: ReturnType<typeof setTimeout>;
  }
>();
let bootTimer: ReturnType<typeof setTimeout> | undefined;
let requestId = 0,
  timer: ReturnType<typeof setTimeout> | undefined;
function boot() {
  if (engineSrc.value) return;
  loading.value = true;
  engineSrc.value = "/simulation/engine.html";
  bootTimer = setTimeout(() => {
    if (!ready.value) {
      loading.value = false;
      engineSrc.value = "";
      error.value =
        "Не удалось загрузить ядро. Проверьте сеть и поддержку WebGL 2, затем повторите.";
    }
  }, 45000);
}
function command(action: string, data: Record<string, unknown> = {}) {
  return new Promise<WorldReport>((resolve, reject) => {
    if (!ready.value) {
      reject(Error("Дождитесь загрузки ядра Godot"));
      return;
    }
    const id = ++requestId;
    pending.set(id, {
      resolve,
      reject,
      timer: setTimeout(() => {
        pending.delete(id);
        reject(Error("Ядро не ответило за 30 секунд"));
      }, 30000),
    });
    engineFrame.value?.contentWindow?.postMessage(
      { channel: "farlands-core", requestId: id, action, ...data },
      location.origin,
    );
  });
}
async function receive(event: MessageEvent) {
  if (
    event.origin !== location.origin ||
    event.source !== engineFrame.value?.contentWindow ||
    event.data?.channel !== "farlands-core"
  )
    return;
  if (event.data.ready) {
    clearTimeout(bootTimer);
    ready.value = true;
    loading.value = false;
    return;
  }
  const p = pending.get(event.data.requestId);
  if (!p) {
    if (event.data.fatal) {
      error.value = event.data.error;
      loading.value = false;
      engineSrc.value = "";
      clearTimeout(bootTimer);
    }
    return;
  }
  clearTimeout(p.timer);
  pending.delete(event.data.requestId);
  try {
    const incoming: WorldEvent[] = [];
    const raw = event.data.events ?? [];
    for (let i = 0; i < raw.length; i += 128)
      incoming.push(...journalPageSchema.parse(raw.slice(i, i + 128)));
    for (const e of incoming) {
      if (e.id !== `event_${journalEvents.length + 1}`)
        throw Error("Разрыв входящего журнала");
      journalEvents.push(e);
    }
    try {
      await appendJournal(
        journalId,
        journalStorageFailed ? journalEvents : incoming,
      );
      journalStorageFailed = false;
    } catch {
      journalStorageFailed = true;
      pause();
    }
  } catch (e) {
    p.reject(e instanceof Error ? e : Error(String(e)));
    return;
  }
  if (event.data.error) {
    // Ядро может остановить длинный прогон после части шага. Показываем его
    // фактический снимок, чтобы UI и последующее сохранение не отставали.
    try {
      void applyReport(parseReport(event.data.report));
    } catch {
      /* Ошибка загрузки снимка оставляет прежний запуск. */
    }
    p.reject(Error(event.data.error));
  } else {
    try {
      p.resolve(parseReport(event.data.report));
    } catch {
      p.reject(Error("Ядро вернуло несовместимый снимок"));
    }
  }
}
async function applyReport(value: WorldReport) {
  value = { ...value, journalId };
  report.value = value;
  if (!value.state.agents[selectedAgent.value])
    selectedAgent.value = Object.keys(value.state.agents)[0] ?? "";
  localSaveState.value = "saving";
  try {
    await saveLocalReport(value);
    if (journalStorageFailed) throw Error("Журнал не сохранён");
    localSaveState.value = "saved";
  } catch {
    localSaveState.value = "failed";
    notice.value = "Хранилище браузера недоступно. Сохраните отчёт JSON.";
  }
}
async function newRun() {
  pause();
  notice.value = "";
  if (!valid.value.success || !draft.value.agents.length) {
    error.value = "Проверьте определения мира и участников";
    return;
  }
  busy.value = true;
  error.value = "";
  journalId = crypto.randomUUID();
  journalEvents = [];
  journalStorageFailed = false;
  try {
    const definition = worldSchema.parse(
        JSON.parse(JSON.stringify(draft.value)),
      ),
      hash = await worldHash(definition);
    await applyReport(
      await command("start", { definition, contentHash: hash }),
    );
    selectedAgent.value = definition.agents[0]?.id ?? "";
  } catch (e) {
    error.value = String(e);
  } finally {
    busy.value = false;
  }
}
async function step(minutes: number) {
  if (busy.value) return;
  minutes = Math.min(minutes, 43560 - (report.value?.state.minute ?? 360));
  if (minutes <= 0) {
    pause();
    notice.value = "";
    return;
  }
  busy.value = true;
  error.value = "";
  notice.value = "";
  advanceCancelled.value = false;
  advanceProgress.value = { done: 0, total: minutes };
  try {
    for (let done = 0; done < minutes && !advanceCancelled.value;) {
      const chunk = Math.min(240, minutes - done);
      await applyReport(await command("advance", { minutes: chunk }));
      done += chunk;
      advanceProgress.value = { done, total: minutes };
      // Даём браузеру обновить прогресс и принять остановку между порциями расчёта.
      if (done < minutes)
        await new Promise((resolve) => setTimeout(resolve, 0));
    }
    if (runFinished.value) {
      pause();
      notice.value = "";
    } else if (advanceCancelled.value)
      notice.value =
        localSaveState.value === "saved"
          ? "Прогон остановлен. Последнее рассчитанное состояние сохранено локально."
          : "Прогон остановлен. Скачайте отчёт JSON: локальное сохранение не подтверждено.";
  } catch (e) {
    pause();
    error.value = String(e);
  } finally {
    advanceProgress.value = null;
    busy.value = false;
  }
}
function pause() {
  playing.value = false;
  advanceCancelled.value = true;
  clearTimeout(timer);
}
async function loop() {
  if (!playing.value) return;
  await step(speed.value);
  if (playing.value) timer = setTimeout(loop, 250);
}
function play() {
  if (playing.value) pause();
  else {
    playing.value = true;
    void loop();
  }
}
async function restoreRun(value: WorldReport) {
  pause();
  const previous = {
    journalId,
    events: journalEvents,
    failed: journalStorageFailed,
  };
  busy.value = true;
  error.value = "";
  notice.value = "";
  try {
    if (value.rulesVersion !== 6) {
      value = JSON.parse(JSON.stringify(value)) as WorldReport;
      const canonical = (id: string) =>
        id.replace(/^(event_[1-9][0-9]*)\.0$/, "$1");
      for (const event of value.state.events) event.id = canonical(event.id);
      for (const event of value.archive ?? []) event.id = canonical(event.id);
      for (const actor of Object.values(value.state.agents))
        actor.knowledge = actor.knowledge.map(canonical);
    }
    if ((await worldHash(value.definition)) !== value.contentHash)
      throw Error("Контрольная сумма определений не совпадает");
    let history: WorldEvent[];
    if (value.archive) history = value.archive;
    else if (value.journal) {
      history = [];
      for (let i = 0; i < value.journal.parts.length; i += 4) {
        notice.value = `Загружаем журнал: ${i} / ${value.journal.parts.length} страниц`;
        const pages = await Promise.all(
          value.journal.parts.slice(i, i + 4).map(async (part) => {
            const page = journalPageSchema.parse(
              await cloudRequest("/api/simulation?part=" + part.hash),
            );
            if ((await journalHash(page)) !== part.hash)
              throw Error("Повреждена страница журнала");
            return page;
          }),
        );
        for (const page of pages) history.push(...page);
      }
    } else if (value.state.journalMode === "external" && value.journalId)
      history = (await readJournal(value.journalId)).filter(
        (e) => Number(e.id.slice(6)) < value.state.nextEvent,
      );
    else history = value.state.events;
    checkJournal(history, value.state.nextEvent);
    journalId = crypto.randomUUID();
    journalEvents = history;
    journalStorageFailed = false;
    try {
      await appendJournal(journalId, history);
    } catch {
      journalStorageFailed = true;
    }
    const { archive, journal, ...compact } = value;
    await applyReport(await command("restore", { report: compact }));
    notice.value =
      value.rulesVersion === 6
        ? "Запуск восстановлен. Авторские анкеты не менялись."
        : "Снимок восстановлен с переносом журнала в отдельный архив. Старые долги задним числом не создаются.";
  } catch (e) {
    journalId = previous.journalId;
    journalEvents = previous.events;
    journalStorageFailed = previous.failed;
    error.value = String(e);
  } finally {
    busy.value = false;
  }
}
async function importRun(event: Event) {
  const input = event.target as HTMLInputElement,
    file = input.files?.[0];
  input.value = "";
  if (!file) return;
  try {
    if (file.size > 100000000)
      throw Error("Максимум 100 МБ для полного архива");
    await restoreRun(parseReport(JSON.parse(await file.text())));
  } catch (e) {
    error.value = String(e);
  }
}
async function importWorld(event: Event) {
  const input = event.target as HTMLInputElement,
    file = input.files?.[0];
  input.value = "";
  if (!file) return;
  try {
    if (file.size > 3500000) throw Error("Максимум 3,5 МБ");
    draft.value = worldSchema.parse(JSON.parse(await file.text()));
    notice.value = "Мир загружен в черновик. Проверьте и сохраните.";
  } catch (e) {
    error.value = String(e);
  }
}
async function cloudList() {
  try {
    runs.value = (await cloudRequest("/api/simulation")).runs;
  } catch (e) {
    notice.value = String(e);
  }
}
function exportRun() {
  if (!report.value) return;
  try {
    checkJournal(journalEvents, report.value.state.nextEvent);
    downloadWorld(
      { ...report.value, archive: journalEvents },
      "farlands-run.json",
    );
  } catch (e) {
    error.value = String(e);
  }
}
async function cloudSave() {
  if (!report.value) return;
  cloudBusy.value = true;
  try {
    const frozen = structuredClone(
      JSON.parse(JSON.stringify(report.value)),
    ) as WorldReport;
    const events = journalEvents.slice(0, frozen.state.nextEvent - 1);
    checkJournal(events, frozen.state.nextEvent);
    const parts: NonNullable<WorldReport["journal"]>["parts"] = [];
    for (let base = 0; base < events.length; base += 512) {
      notice.value = `Сохраняем журнал: ${Math.min(base, events.length)} / ${events.length} событий`;
      await Promise.all(
        [0, 128, 256, 384]
          .filter((offset) => base + offset < events.length)
          .map(async (offset) => {
            const i = base + offset,
              page = journalPageSchema.parse(events.slice(i, i + 128)),
              hash = await journalHash(page);
            parts[i / 128] = {
              hash,
              first: i + 1,
              last: i + page.length,
              count: page.length,
            };
            await cloudRequest("/api/simulation?part=" + hash, "PUT", page);
          }),
      );
    }
    frozen.journal = { parts, count: events.length };
    delete frozen.archive;
    await cloudRequest(
      "/api/simulation?id=" + crypto.randomUUID(),
      "PUT",
      frozen,
    );
    notice.value = "Снимок сохранён в приватное облако";
    await cloudList();
  } catch (e) {
    error.value = String(e);
  } finally {
    cloudBusy.value = false;
  }
}
async function cloudLoad(id: string) {
  try {
    await restoreRun(
      parseReport(await cloudRequest("/api/simulation?id=" + id)),
    );
  } catch (e) {
    error.value = String(e);
  }
}
function npcPoint(a: WorldAgent, index: number) {
  if (a.action.type === "travel") {
    let t = Number(a.action.elapsed);
    for (const leg of a.action.legs as {
      from: string;
      to: string;
      minutes: number;
    }[]) {
      if (t <= leg.minutes) {
        const f = point(leg.from),
          to = point(leg.to),
          p = t / leg.minutes;
        return { x: f.x + (to.x - f.x) * p, y: f.y + (to.y - f.y) * p };
      }
      t -= leg.minutes;
    }
  }
  const p = point(a.place);
  return { x: p.x + index * 12 - 12, y: p.y + 22 };
}
watch(
  () => props.page,
  (page) => {
    pause();
    if (page === "simulation") boot();
  },
);
onMounted(async () => {
  window.addEventListener("message", receive);
  if (props.page === "simulation") boot();
  localAvailable.value = await loadLocalReport();
});
onUnmounted(() => {
  pause();
  clearTimeout(bootTimer);
  window.removeEventListener("message", receive);
  for (const p of pending.values()) {
    clearTimeout(p.timer);
    p.reject(Error("Раздел закрыт"));
  }
  pending.clear();
});
</script>
<template>
  <section class="world-studio">
    <div class="world-heading panel">
      <div>
        <span class="eyebrow">FARM & FARLANDS / WORLD LAB</span>
        <h2>
          {{
            page === "world"
              ? "Логический мир"
              : page === "economy"
                ? "Экономика мира"
                : "Лаборатория симуляции"
          }}
        </h2>
        <p class="hint">
          {{
            page === "world"
              ? "Девять сцен, места и маршруты. Город проектируется отдельно."
              : page === "economy"
                ? "Начальные условия тестового мира. Баланс пока экспериментальный."
                : "Единое ядро Godot. Прогон не изменяет авторские анкеты."
          }}
        </p>
      </div>
      <div class="world-toolbar">
        <button :disabled="!dirty" @click="commit">
          <Save :size="15" />Сохранить мир<span v-if="dirty">*</span></button
        ><button
          @click="
            downloadWorld(
              valid.success ? valid.data : draft,
              'farlands-world.json',
            )
          "
        >
          <Download :size="15" />JSON мира</button
        ><button @click="exportGodotWorld">Пакет мира для Godot</button
        ><button @click="worldFile?.click()">
          <Upload :size="15" />Импорт мира</button
        ><input
          ref="worldFile"
          type="file"
          accept="application/json"
          hidden
          @change="importWorld"
        />
      </div>
    </div>
    <p v-if="notice" class="world-notice" role="status">{{ notice }}</p>
    <p v-if="error" class="world-error" role="alert">
      {{ error }} <button @click="error = ''">×</button>
    </p>
    <p v-if="!valid.success" class="world-error">
      Черновик: {{ valid.error.issues[0]?.message }}. Последняя корректная
      версия сохранена.
    </p>
    <template v-if="page === 'world'">
      <div class="world-layout">
        <div class="panel world-map-panel">
          <div class="world-toolbar">
            <strong>Карта региона</strong
            ><label class="world-check"
              ><input v-model="reference" type="checkbox" />Подложка</label
            ><button @click="zoom = Math.min(3, zoom + 0.25)">+</button
            ><button
              @click="
                zoom = Math.max(1, zoom - 0.25);
                pan = { x: 0, y: 0 };
              "
            >
              −</button
            ><button @click="addPlace"><Plus :size="15" />Место</button>
          </div>
          <svg
            class="world-map"
            :viewBox="`${pan.x * 1.5} ${pan.y} ${1500 / zoom} ${1000 / zoom}`"
            preserveAspectRatio="none"
            @pointerdown="panDown"
            @pointermove="move"
            @pointerup="
              drag = null;
              panning = null;
            "
            @pointercancel="
              drag = null;
              panning = null;
            "
          >
            <image
              v-if="reference"
              href="/simulation/region-reference.png"
              width="1500"
              height="1000"
              preserveAspectRatio="none"
              opacity=".25"
            />
            <g v-for="i in 9" :key="i">
              <rect
                :x="((i - 1) % 3) * 500"
                :y="Math.floor((i - 1) / 3) * 333.33"
                width="500"
                height="333.33"
                fill="transparent"
                stroke="#d4b37630"
              />
              <text
                :x="((i - 1) % 3) * 500 + 14"
                :y="Math.floor((i - 1) / 3) * 333.33 + 28"
                fill="#a8936c"
                font-size="18"
              >
                {{ i }}{{ i === 6 ? " · город условный" : "" }}
              </text>
            </g>
            <line
              v-for="r in draft.routes"
              :key="r.id"
              :x1="point(r.from).x * 1.5"
              :y1="point(r.from).y"
              :x2="point(r.to).x * 1.5"
              :y2="point(r.to).y"
              :stroke="r.open ? '#bc995d' : '#914d4d'"
              :stroke-dasharray="r.open ? '' : '8 6'"
              stroke-width="3"
            />
            <g
              v-for="p in draft.places"
              :key="p.id"
              class="world-map-node"
              role="button"
              tabindex="0"
              :aria-label="'Место ' + p.name"
              @keydown.enter="selected = p.id"
              @pointerdown.stop="down($event, p.id)"
            >
              <circle
                :cx="p.x * 1.5"
                :cy="p.y"
                :r="selected === p.id ? 12 : 9"
                :fill="p.exists ? '#e9b452' : '#686970'"
                stroke="#24242b"
                stroke-width="3"
              />
              <text
                :x="p.x * 1.5 + (p.x > 800 ? -16 : 16)"
                :text-anchor="p.x > 800 ? 'end' : 'start'"
                :y="p.y - 10"
                font-size="15"
                fill="#f2e7ce"
              >
                {{ p.name }}
              </text>
            </g>
          </svg>
          <p class="hint">
            Перетаскивайте места. Время пути задаётся маршрутами, а не
            расстоянием на рисунке. Город на подложке — пример.
          </p>
        </div>
        <aside class="panel world-inspector">
          <h3>Свойства места</h3>
          <label
            >Место<select v-model="selected">
              <option v-for="p in draft.places" :key="p.id" :value="p.id">
                {{ p.name }}
              </option>
            </select></label
          ><template v-if="choice"
            ><label
              >Название<input v-model="choice.name" maxlength="100"
            /></label>
            <div class="world-fields">
              <label
                >Сцена<input
                  v-model.number="choice.scene"
                  type="number"
                  min="1"
                  max="9" /></label
              ><label
                >Тип<select v-model="choice.kind">
                  <option value="home">Жильё</option>
                  <option value="work">Работа</option>
                  <option value="shop">Торговля</option>
                  <option value="nature">Природа</option>
                  <option value="exit">Выход</option>
                </select></label
              ><label
                >X карты<input
                  v-model.number="choice.x"
                  type="number"
                  min="0"
                  max="1000" /></label
              ><label
                >Y карты<input
                  v-model.number="choice.y"
                  type="number"
                  min="0"
                  max="1000"
              /></label>
            </div>
            <label class="world-check"
              ><input v-model="choice.exists" type="checkbox" />Существует в
              мире</label
            ><label
              >Сцена Godot<input
                v-model="choice.godotPath"
                placeholder="Необязательно · res://…" /></label
            ><small>ID: {{ choice.id }}</small
            ><button class="danger" @click="deletePlace">
              Удалить свободное место
            </button></template
          >
        </aside>
      </div>
      <details class="panel world-section" open>
        <summary>Маршруты · {{ draft.routes.length }}</summary>
        <div class="world-table-wrap">
          <table class="world-table">
            <thead>
              <tr>
                <th>Откуда</th>
                <th>Куда</th>
                <th>Минуты</th>
                <th>Движение</th>
                <th>Открыт</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(r, i) in draft.routes" :key="r.id">
                <td>
                  <select v-model="r.from" aria-label="Маршрут откуда">
                    <option v-for="p in draft.places" :key="p.id" :value="p.id">
                      {{ p.name }}
                    </option>
                  </select>
                </td>
                <td>
                  <select v-model="r.to" aria-label="Маршрут куда">
                    <option v-for="p in draft.places" :key="p.id" :value="p.id">
                      {{ p.name }}
                    </option>
                  </select>
                </td>
                <td>
                  <input
                    v-model.number="r.minutes"
                    type="number"
                    min="1"
                    max="1440"
                    aria-label="Время маршрута"
                  />
                </td>
                <td>
                  <select v-model="r.mode">
                    <option value="walk">Пешком</option>
                    <option value="cart">Повозка</option>
                    <option value="boat">Лодка</option>
                  </select>
                </td>
                <td>
                  <input
                    v-model="r.open"
                    type="checkbox"
                    aria-label="Маршрут открыт"
                  />
                </td>
                <td>
                  <button
                    aria-label="Удалить маршрут"
                    @click="draft.routes.splice(i, 1)"
                  >
                    ×
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <button @click="addRoute"><Plus :size="15" />Маршрут</button>
        <p class="hint">
          Первый прогон использует пешие маршруты; лодка и повозка не
          подменяются пешим переходом.
        </p>
      </details>
      <details class="panel world-section">
        <summary>
          Участники и начальные привязки · {{ draft.agents.length }}
        </summary>
        <div class="world-table-wrap">
          <table class="world-table">
            <thead>
              <tr>
                <th>Персонаж</th>
                <th>Настройка</th>
                <th>Дом</th>
                <th>Работа</th>
                <th>Роль</th>
                <th>Счёт</th>
                <th>Работодатель</th>
                <th>Зарплата</th>
                <th>Аренда</th>
                <th>Груз, кг · обычно 10</th>
                <th>Цель: дом</th>
                <th>Участие</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="a in draft.agents" :key="a.id">
                <td>
                  {{ a.name }}
                  <details v-if="a.sourceProfession || a.setupNotes">
                    <summary>Анкета и допущения</summary>
                    <p>
                      {{ a.sourceProfession }} · {{ a.sourceHome }} ·
                      {{ a.sourceWorkplace }}
                    </p>
                    <p>{{ a.sourceGoal }}</p>
                    <p>{{ a.setupNotes }}</p>
                  </details>
                </td>
                <td>
                  <select v-model="a.setupStatus">
                    <option value="test">Тестовые</option>
                    <option value="reviewed">Проверены</option>
                  </select>
                </td>
                <td>
                  <select v-model="a.home">
                    <option v-for="p in draft.places" :key="p.id" :value="p.id">
                      {{ p.name }}
                    </option>
                  </select>
                </td>
                <td>
                  <select v-model="a.work">
                    <option v-for="p in draft.places" :key="p.id" :value="p.id">
                      {{ p.name }}
                    </option>
                  </select>
                </td>
                <td>
                  <select v-model="a.role">
                    <option value="stable">Конюх</option>
                    <option value="farmer">Фермер</option>
                    <option value="innkeeper">Хозяин таверны</option>
                    <option value="resident">Житель</option>
                  </select>
                </td>
                <td>
                  <select v-model="a.account">
                    <option
                      v-for="c in draft.accounts"
                      :key="c.id"
                      :value="c.id"
                    >
                      {{ c.name }}
                    </option>
                  </select>
                </td>
                <td>
                  <select v-model="a.employer">
                    <option
                      v-for="c in draft.accounts"
                      :key="c.id"
                      :value="c.id"
                    >
                      {{ c.name }}
                    </option>
                  </select>
                </td>
                <td><input v-model.number="a.wage" type="number" min="0" /></td>
                <td><input v-model.number="a.rent" type="number" min="0" /></td>
                <td>
                  <input
                    v-model.number="a.carryCapacity"
                    type="number"
                    min="0"
                    max="1000"
                    step="0.1"
                    placeholder="10"
                    :aria-label="'Грузоподъёмность ' + a.name"
                  />
                </td>
                <td><input v-model="a.goalHouse" type="checkbox" /></td>
                <td>
                  <button
                    :aria-label="'Отключить от симуляции ' + a.name"
                    @click="detachAgent(a.id)"
                  >
                    Отключить
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <button @click="addAgent">
          <Plus :size="15" />Подключить следующего NPC
        </button>
        <button @click="prepareAll">Подготовить всех живых NPC</button>
        <p class="hint">
          Отключение меняет только состав новых прогонов. Анкета, счета и уже
          сохранённые запуски сохраняются.
        </p>
      </details>
      <details class="panel world-section">
        <summary>Общие параметры и защищённые факты</summary>
        <label>Название мира<input v-model="draft.name" /></label
        ><label
          >Зерно запуска<input
            v-model.number="draft.seed"
            type="number"
            min="0" /></label
        ><label>Примечания<textarea v-model="draft.notes" /></label
        ><label v-for="(_, i) in draft.protectedFacts" :key="i"
          >Защищённый факт<input v-model="draft.protectedFacts[i]"
        /></label>
      </details>
    </template>
    <template v-else-if="page === 'economy'">
      <div class="world-economy-tabs">
        <button
          v-for="[key, label] in [
            ['accounts', 'Счета'],
            ['items', 'Товары'],
            ['stocks', 'Запасы'],
            ['production', 'Производство и жильё'],
          ]"
          :key="key"
          :class="{ chosen: tab === key }"
          @click="tab = key!"
        >
          {{ label }}
        </button>
      </div>
      <div class="panel world-section">
        <template v-if="tab === 'accounts'"
          ><div class="world-table-wrap">
            <table class="world-table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Счёт</th>
                  <th>Начальные средства</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="a in draft.accounts" :key="a.id">
                  <td>
                    <code>{{ a.id }}</code>
                  </td>
                  <td><input v-model="a.name" /></td>
                  <td>
                    <input v-model.number="a.balance" type="number" min="0" />
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <button @click="addAccount"><Plus :size="15" />Счёт</button></template
        >
        <template v-if="tab === 'items'"
          ><details class="world-catalog">
            <summary @click="!catalog.length && loadCatalog()">
              Справочник предметов из игрового репозитория
            </summary>
            <input v-model="catalogQuery" placeholder="Найти товар игры" />
            <div class="world-catalog-list">
              <div v-for="item in catalogFiltered" :key="item.id">
                <span
                  >{{ item.name }} · {{ item.id }} · {{ item.weight }} кг · база
                  {{ item.baseValue }}</span
                ><button
                  :disabled="draft.items.some((i) => i.id === item.id)"
                  @click="useCatalogItem(item)"
                >
                  {{
                    draft.items.some((i) => i.id === item.id)
                      ? "Подключён"
                      : "Добавить"
                  }}
                </button>
              </div>
            </div>
          </details>
          <p class="hint">
            ID wheat, flour, potato взяты из игры. Цены — параметры стенда, не
            замена каталога DataRegistry.
          </p>
          <div class="world-table-wrap">
            <table class="world-table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Название</th>
                  <th>Вес</th>
                  <th>Цена</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="a in draft.items" :key="a.id">
                  <td>
                    <code>{{ a.id }}</code>
                  </td>
                  <td><input v-model="a.name" /></td>
                  <td>
                    <input
                      v-model.number="a.weight"
                      type="number"
                      min="0"
                      step=".1"
                    />
                  </td>
                  <td>
                    <input v-model.number="a.price" type="number" min="0" />
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <button @click="addItem"><Plus :size="15" />Товар</button></template
        >
        <template v-if="tab === 'stocks'"
          ><div class="world-table-wrap">
            <table class="world-table">
              <thead>
                <tr>
                  <th>Место</th>
                  <th>Владелец</th>
                  <th>Товар</th>
                  <th>Количество</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="a in draft.stocks" :key="a.id">
                  <td>
                    <select v-model="a.place">
                      <option
                        v-for="p in draft.places"
                        :key="p.id"
                        :value="p.id"
                      >
                        {{ p.name }}
                      </option>
                    </select>
                  </td>
                  <td>
                    <select v-model="a.owner">
                      <option
                        v-for="p in draft.accounts"
                        :key="p.id"
                        :value="p.id"
                      >
                        {{ p.name }}
                      </option>
                    </select>
                  </td>
                  <td>
                    <select v-model="a.item">
                      <option
                        v-for="p in draft.items"
                        :key="p.id"
                        :value="p.id"
                      >
                        {{ p.name }}
                      </option>
                    </select>
                  </td>
                  <td>
                    <input v-model.number="a.amount" type="number" min="0" />
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <button @click="addStock"><Plus :size="15" />Запас</button></template
        >
        <template v-if="tab === 'production'"
          ><h3>Переработка сырья</h3>
          <div class="world-fields">
            <label
              >Место<select v-model="draft.production.place">
                <option v-for="p in draft.places" :key="p.id" :value="p.id">
                  {{ p.name }}
                </option>
              </select></label
            ><label
              >Владелец<select v-model="draft.production.owner">
                <option v-for="p in draft.accounts" :key="p.id" :value="p.id">
                  {{ p.name }}
                </option>
              </select></label
            ><label
              >Сырьё<select v-model="draft.production.input">
                <option v-for="p in draft.items" :key="p.id" :value="p.id">
                  {{ p.name }}
                </option>
              </select></label
            ><label
              >Результат<select v-model="draft.production.output">
                <option v-for="p in draft.items" :key="p.id" :value="p.id">
                  {{ p.name }}
                </option>
              </select></label
            ><label
              >Расход<input
                v-model.number="draft.production.inputAmount"
                type="number"
                min="1" /></label
            ><label
              >Выход<input
                v-model.number="draft.production.outputAmount"
                type="number"
                min="1" /></label
            ><label
              >Минут труда<input
                v-model.number="draft.production.minutes"
                type="number"
                min="10"
            /></label>
          </div>
          <h3>Предложение жилья</h3>
          <div class="world-fields">
            <label
              >Дом<select v-model="draft.house.place">
                <option v-for="p in draft.places" :key="p.id" :value="p.id">
                  {{ p.name }}
                </option>
              </select></label
            ><label
              >Продавец<select v-model="draft.house.seller">
                <option v-for="p in draft.accounts" :key="p.id" :value="p.id">
                  {{ p.name }}
                </option>
              </select></label
            ><label
              >Стоимость<input
                v-model.number="draft.house.price"
                type="number"
                min="0"
            /></label></div
        ></template></div
    ></template>
    <template v-else>
      <NeedsPanel
        v-model="draft.needs"
        v-model:selected="selectedAgent"
        :actors="report?.definition.agents ?? []"
        :running="!!report"
        :active="report?.definition.needs"
        :actor="inspect"
      />
      <div class="panel world-run-controls">
        <div class="world-toolbar">
          <strong>{{
            report
              ? formatWorldTime(report.state.minute)
              : "Запуск ещё не создан"
          }}</strong
          ><span :class="['world-core-status', { ready }]">{{
            ready
              ? "Godot готов"
              : loading
                ? "Загрузка Godot…"
                : "Ядро выключено"
          }}</span
          ><button v-if="!engineSrc" @click="boot">Загрузить ядро</button
          ><button class="primary" :disabled="!ready || busy" @click="newRun">
            Новый запуск</button
          ><button
            :disabled="!report || !ready || runFinished || (!playing && busy)"
            @click="play"
          >
            <Pause v-if="playing" :size="15" /><Play v-else :size="15" />{{
              playing ? "Пауза" : "Пуск"
            }}</button
          ><button
            :disabled="!report || !ready || runFinished || busy || playing"
            @click="step(60)"
          >
            Час</button
          ><button
            :disabled="!report || !ready || runFinished || busy || playing"
            @click="step(1440)"
          >
            День</button
          ><button
            :disabled="!report || !ready || runFinished || busy || playing"
            @click="step(10080)"
          >
            7 дней</button
          ><button
            v-if="advanceProgress && advanceProgress.total > 240"
            :disabled="advanceCancelled"
            @click="advanceCancelled = true"
          >
            Остановить прогон</button
          ><span
            v-if="advanceProgress && advanceProgress.total > 240"
            role="status"
            >Рассчитано {{ advanceProgress.done }} /
            {{ advanceProgress.total }} мин.</span
          ><select v-model.number="speed" aria-label="Скорость симуляции">
            <option :value="15">15 мин / шаг</option>
            <option :value="60">1 час / шаг</option>
            <option :value="240">4 часа / шаг</option>
          </select>
        </div>
        <p v-if="runFinished" class="world-notice" role="status">
          {{ finishedNotice }}
        </p>
        <p
          v-if="report"
          :class="localSaveState === 'failed' ? 'world-error' : 'hint'"
          role="status"
        >
          {{
            localSaveState === "saved"
              ? "Контрольная точка сохранена на этом устройстве."
              : localSaveState === "failed"
                ? "Локальное сохранение недоступно. Скачайте отчёт JSON или сохраните снимок в облако."
                : "Сохраняем контрольную точку…"
          }}
        </p>
        <p class="hint">
          Определения фиксируются при создании запуска. Изменения редактора
          действуют только в новом прогоне. Максимум 30 дней на запуск. История
          хранится отдельными страницами; полный архив доступен в JSON.
        </p>
        <div class="world-toolbar">
          <button :disabled="!report || cloudBusy" @click="cloudSave">
            <Save :size="15" />Снимок в облако</button
          ><button :disabled="!report" @click="exportRun">
            <Download :size="15" />Отчёт JSON</button
          ><button :disabled="!ready || busy" @click="imported?.click()">
            <Upload :size="15" />Восстановить файл</button
          ><button
            v-if="localAvailable && !report"
            :disabled="!ready || busy"
            @click="restoreRun(localAvailable)"
          >
            Продолжить локальный запуск</button
          ><button @click="cloudList">Облачные снимки</button
          ><input
            ref="imported"
            type="file"
            hidden
            accept="application/json"
            @change="importRun"
          />
        </div>
        <details v-if="runs.length">
          <summary>Снимки · {{ runs.length }}</summary>
          <button
            v-for="r in runs"
            :key="r.id"
            :disabled="!ready || busy"
            @click="cloudLoad(r.id)"
          >
            {{ new Date(r.createdAt).toLocaleString("ru-RU") }} ·
            {{ r.id.slice(0, 8) }}
          </button>
        </details>
      </div>
      <template v-if="report"
        ><div class="world-stats">
          <div class="panel">
            <strong>{{ agents.length }}</strong
            ><span>Участников</span>
          </div>
          <div class="panel">
            <strong>{{
              Object.values(report.state.accounts).reduce((a, b) => a + b, 0)
            }}</strong
            ><span>Денег во всех счетах</span>
          </div>
          <div class="panel">
            <strong>{{ report.state.nextEvent - 1 }}</strong
            ><span>Событий</span>
          </div>
          <div
            class="panel"
            :class="checks.length ? 'world-error' : 'world-valid'"
          >
            <strong>{{
              checks.length ? "Ошибка учёта" : "Баланс сходится"
            }}</strong
            ><span>{{
              checks.join("; ") || "Деньги, товары и защищённые факты"
            }}</span>
          </div>
        </div>
        <details
          v-if="alerts.length"
          class="panel world-section world-alerts"
          open
        >
          <summary>Требует внимания · {{ alerts.length }}</summary>
          <p v-for="message in alerts" :key="message">{{ message }}</p>
        </details>
        <div
          v-if="transportPlans.length"
          class="world-transport-plans"
          aria-label="Действующие планы перевозок"
        >
          <button
            v-for="row in transportPlans"
            :key="row.actor"
            @click="selectedAgent = row.actor"
          >
            <strong>{{ agentName(row.actor) }}</strong
            ><span>{{ row.plan!.title }}</span
            ><small>{{ row.plan!.phase }}</small>
          </button>
        </div>
        <div class="world-layout">
          <div class="panel world-map-panel">
            <svg
              class="world-map"
              viewBox="0 0 1500 1000"
              preserveAspectRatio="none"
            >
              <g v-for="i in 9" :key="i">
                <rect
                  :x="((i - 1) % 3) * 500"
                  :y="Math.floor((i - 1) / 3) * 333.33"
                  width="500"
                  height="333.33"
                  fill="transparent"
                  stroke="#d4b37630"
                />
                <text
                  :x="((i - 1) % 3) * 500 + 12"
                  :y="Math.floor((i - 1) / 3) * 333.33 + 25"
                  fill="#a8936c"
                  font-size="18"
                >
                  {{ i }}
                </text>
              </g>
              <line
                v-for="r in activeWorld.routes"
                :key="r.id"
                :x1="point(r.from).x * 1.5"
                :y1="point(r.from).y"
                :x2="point(r.to).x * 1.5"
                :y2="point(r.to).y"
                :stroke="r.open ? '#bc995d' : '#914d4d'"
                stroke-width="3"
              />
              <g v-for="p in activeWorld.places" :key="p.id">
                <circle :cx="p.x * 1.5" :cy="p.y" r="7" fill="#b5a07e" />
                <text
                  :x="p.x * 1.5 + (p.x > 800 ? -10 : 10)"
                  :text-anchor="p.x > 800 ? 'end' : 'start'"
                  :y="p.y - 10"
                  font-size="15"
                  fill="#c8bda8"
                >
                  {{ p.name }}
                </text>
              </g>
              <g
                v-for="(a, i) in agents"
                :key="a.id"
                role="button"
                tabindex="0"
                :aria-label="'Наблюдать ' + agentName(a.id)"
                @click="selectedAgent = a.id"
                @keydown.enter="selectedAgent = a.id"
              >
                <circle
                  :cx="npcPoint(a, i).x * 1.5"
                  :cy="npcPoint(a, i).y"
                  r="14"
                  :fill="a.id === inspect?.id ? '#fac65e' : '#89b5a2'"
                />
                <text
                  :x="npcPoint(a, i).x * 1.5 + 18"
                  :y="npcPoint(a, i).y + 8"
                  font-size="16"
                  fill="white"
                >
                  {{ agentName(a.id).split(" ")[0] }}
                </text>
              </g>
            </svg>
            <p class="hint">
              Движение показывает прогресс одного путешествия. География пока
              условная.
            </p>
          </div>
          <aside v-if="inspect" class="panel world-inspector">
            <label
              >Наблюдать<select v-model="selectedAgent" aria-label="Наблюдать">
                <option v-for="a in agents" :key="a.id" :value="a.id">
                  {{ agentName(a.id) }}
                </option>
              </select></label
            >
            <div class="world-agent-heading">
              <img v-if="avatar(inspect.id)" :src="avatar(inspect.id)" alt="" />
              <h3>{{ agentName(inspect.id) }}</h3>
            </div>
            <p>
              {{ actionLabels[inspect.action.type] || "Выбирает действие" }} ·
              {{ placeName(inspect.place) }}
            </p>
            <label
              >Энергия <meter min="0" max="1000" :value="inspect.energy" />{{
                Math.round(inspect.energy / 10)
              }}%</label
            ><label
              >Сытость <meter min="0" max="1000" :value="inspect.hunger" />{{
                Math.round(inspect.hunger / 10)
              }}%</label
            >
            <p><strong>Цель:</strong> {{ inspect.goal }}</p>
            <div v-if="housingPlan" class="world-goal-plan">
              <strong>План: собственный дом</strong>
              <p v-if="housingPlan.reserved">
                Под обязательства зарезервировано: {{ housingPlan.reserved }}.
                Прогресс считает свободные средства.
              </p>
              <progress
                :value="housingPlan.progress"
                max="100"
                :aria-label="'Накопления на дом ' + agentName(inspect.id)"
              />
              <p>
                {{
                  housingPlan.bought
                    ? "Дом приобретён. Цель выполнена."
                    : housingPlan.remaining > 0
                      ? `Заработать ещё ${housingPlan.remaining}. Сейчас ${housingPlan.balance} из ${housingPlan.price}.`
                      : "Средства собраны. Следующий этап — прийти к продавцу и оформить покупку."
                }}
              </p>
              <small
                >Труд сегодня: {{ inspect.workMinutes }} / 240 мин для дневной
                оплаты.
                {{
                  inspect.lastPaidDay === Math.floor(report.state.minute / 1440)
                    ? "Оплата получена."
                    : "Оплата ещё не получена."
                }}</small
              >
            </div>
            <p><strong>Почему:</strong> {{ inspect.reason }}</p>
            <p v-if="inspect.action.remaining">
              <strong>До завершения:</strong>
              {{ inspect.action.remaining }} мин.
            </p>
            <p v-if="inspect.action.type === 'travel'">
              <strong>Назначение:</strong> {{ placeName(inspect.action.to) }} ·
              {{
                Math.round(
                  (100 * inspect.action.elapsed) / inspect.action.total,
                )
              }}%
            </p>
            <p v-if="inspect.action.type === 'travel'">
              <strong>После прибытия:</strong>
              {{
                actionLabels[inspect.action.after?.type] ||
                "Следующий этап плана"
              }}
            </p>
            <p v-if="inspect.cargo">
              <strong>Груз:</strong> {{ inspect.cargo.item }} ×
              {{ inspect.cargo.amount }} ·
              {{ cargoWeight.toFixed(2) }} кг<br /><small
                >Владелец:
                {{
                  activeWorld.accounts.find(
                    (a) => a.id === inspect.cargo?.owner,
                  )?.name ?? inspect.cargo.owner
                }}. Оплата при доставке.</small
              >
            </p>
            <p><strong>Дом:</strong> {{ placeName(inspect.home) }}</p>
            <p
              v-for="debt in personalObligations"
              :key="debt.id"
              class="world-critical"
            >
              <strong
                >{{
                  debt.kind === "wage"
                    ? "Ещё должны за работу"
                    : "Задолженность по аренде"
                }}:</strong
              >
              {{ debt.remaining }} · день {{ debt.day + 1 }}
            </p>
            <p>
              <strong>Деньги:</strong>
              {{
                report.state.accounts[
                  activeWorld.agents.find((a) => a.id === inspect.id)!.account
                ]
              }}
            </p>
            <details>
              <summary>Оценки действий</summary>
              <p v-for="c in inspect.choices" :key="c.action">
                <strong
                  >{{ c.score < 0 ? "Недоступно" : c.score }} ·
                  {{ c.action }}</strong
                ><br />{{ c.reason }}
              </p>
            </details>
            <details>
              <summary>Знания и отношения</summary>
              <p>
                Известных событий:
                {{ inspect.knownEventCount ?? inspect.knowledge.length }} ·
                недавняя память: {{ inspect.knowledge.length }}
              </p>
              <p v-for="(value, key) in inspect.relationships" :key="key">
                {{ agentName(String(key)) }}: {{ value }}
              </p>
            </details>
          </aside>
        </div>
        <details class="panel world-section">
          <summary>
            Жители · {{ agents.length }} · счета, запасы и собственность
          </summary>
          <div class="world-table-wrap">
            <table class="world-table world-residents">
              <thead>
                <tr>
                  <th>Персонаж</th>
                  <th>Сейчас</th>
                  <th>Место</th>
                  <th>Деньги</th>
                  <th>Сытость</th>
                  <th>Энергия</th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="a in agents"
                  :key="a.id"
                  :class="{ 'world-selected': selectedAgent === a.id }"
                >
                  <td>
                    <button @click="selectedAgent = a.id">
                      <img v-if="avatar(a.id)" :src="avatar(a.id)" alt="" />{{
                        agentName(a.id)
                      }}
                    </button>
                  </td>
                  <td>{{ actionLabels[a.action.type] || "Выбирает дело" }}</td>
                  <td>{{ placeName(a.place) }}</td>
                  <td>{{ personalBalance(a.id) }}</td>
                  <td :class="{ 'world-critical': a.hunger < 150 }">
                    {{ Math.round(a.hunger / 10) }}%
                  </td>
                  <td :class="{ 'world-critical': a.energy < 100 }">
                    {{ Math.round(a.energy / 10) }}%
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <details class="world-obligations">
            <summary>
              Неоплаченные обязательства · {{ outstanding.length }}
            </summary>
            <p v-if="!outstanding.length" class="hint">
              Все начисления оплачены.
            </p>
            <p class="hint">
              Начисление фиксирует обязанность. Деньги переходят только при
              оплате; доступная сумма погашает долг частично. Остаток
              сохраняется и проверяется каждый час. Проценты и выселение не
              моделируются.
            </p>
            <div class="world-table-wrap">
              <table class="world-table">
                <thead>
                  <tr>
                    <th>Начислено</th>
                    <th>Основание</th>
                    <th>Плательщик → получатель</th>
                    <th>Сумма</th>
                    <th>Осталось</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="debt in outstanding" :key="debt.id">
                    <td>{{ formatWorldTime(debt.created) }}</td>
                    <td>{{ debt.label }} · {{ agentName(debt.actor) }}</td>
                    <td>
                      {{ accountName(debt.from) }} → {{ accountName(debt.to) }}
                    </td>
                    <td>{{ debt.amount }}</td>
                    <td class="world-critical">{{ debt.remaining }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </details>
          <div class="world-state-grid">
            <div>
              <h3>Счета</h3>
              <p v-for="a in activeWorld.accounts" :key="a.id">
                {{ a.name }} <strong>{{ report.state.accounts[a.id] }}</strong>
              </p>
            </div>
            <div>
              <h3>Запасы</h3>
              <p v-for="s in activeWorld.stocks" :key="s.id">
                {{ s.item }} · {{ placeName(s.place) }}
                <strong>{{ report.state.stocks[s.id] }}</strong>
              </p>
            </div>
            <div>
              <h3>Собственность</h3>
              <p v-for="(owner, place) in report.state.owners" :key="place">
                {{ placeName(String(place)) }} →
                {{
                  activeWorld.accounts.find((a) => a.id === owner)?.name ??
                  owner
                }}
              </p>
            </div>
          </div>
        </details>
        <section class="panel world-section">
          <div class="world-toolbar">
            <h3>Журнал событий</h3>
            <select v-model="eventActor" aria-label="Участник событий">
              <option value="">Все участники</option>
              <option v-for="a in agents" :key="a.id" :value="a.id">
                {{ agentName(a.id) }} · участник / свидетель
              </option>
            </select>
            <input
              v-model="eventQuery"
              placeholder="Поиск в журнале"
              aria-label="Поиск событий симуляции"
            /><select v-model="eventType" aria-label="Тип события симуляции">
              <option value="">Все события</option>
              <option
                v-for="(label, key) in eventLabels"
                :key="key"
                :value="key"
              >
                {{ label }}
              </option>
            </select>
          </div>
          <p class="hint">
            Последние 100 подходящих событий. Полный журнал находится в отчёте.
          </p>
          <div class="world-journal">
            <article v-for="e in visibleEvents" :key="e.id">
              <time>{{ formatWorldTime(e.minute) }}</time
              ><span class="world-event-type">{{
                eventLabels[e.type] ?? e.type
              }}</span>
              <div>
                <strong>{{ agentName(e.actor) }}</strong>
                <p>{{ e.text }}</p>
                <small v-if="e.witnesses.length"
                  >Знают: {{ e.witnesses.map(agentName).join(", ") }}</small
                >
              </div>
            </article>
          </div>
        </section></template
      >
      <div v-else class="panel world-empty">
        <h3>Жизнь NPC без участия игрока</h3>
        <p>
          Тео работает, оплачивает жильё и еду, перевозит реальный груз и копит
          на дом. Мартин перерабатывает ограниченное сырьё. Разговор возникает
          только при доступности обоих участников.
        </p>
        <p>
          Первый запуск загружает ядро Godot (около 40 МБ). Вычисления идут на
          вашем устройстве, без платных API-запросов.
        </p>
      </div>
    </template>
    <iframe
      v-if="engineSrc"
      ref="engineFrame"
      :src="engineSrc"
      class="world-engine"
      title="Ядро симуляции Godot"
      tabindex="-1"
      aria-hidden="true"
    />
  </section>
</template>
<style src="../world.css"></style>
