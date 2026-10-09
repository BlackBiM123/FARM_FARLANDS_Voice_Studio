import { computed, onUnmounted, ref, watch } from "vue";
export function pacificDay(time: number) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(time));
}
export function nextDailyReset(time: number) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "numeric",
    day: "numeric",
  }).formatToParts(new Date(time));
  const get = (type: string) =>
    Number(parts.find((p) => p.type === type)!.value);
  const midnight = Date.UTC(get("year"), get("month") - 1, get("day") + 1);
  const offset = new Intl.DateTimeFormat("en", {
    timeZone: "America/Los_Angeles",
    timeZoneName: "longOffset",
  })
    .formatToParts(new Date(midnight + 8 * 3600000))
    .find((p) => p.type === "timeZoneName")!.value;
  const match = offset.match(/GMT([+-])(\d{2}):(\d{2})/)!;
  return (
    midnight -
    (match[1] === "-" ? -1 : 1) *
      (Number(match[2]) * 60 + Number(match[3])) *
      60000
  );
}
export function duration(ms: number) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 3600)
    .toString()
    .padStart(
      2,
      "0",
    )}:${Math.floor(s / 60) % 60 < 10 ? "0" : ""}${Math.floor(s / 60) % 60}:${(s % 60).toString().padStart(2, "0")}`;
}
type State = {
  events: { model: string; at: number }[];
  limits: Record<
    string,
    {
      rpm: number | null;
      rpd: number | null;
      tpm: number | null;
      source: string;
    }
  >;
  blocked: Record<string, number>;
  lastError: Record<string, string>;
};
export function useQuota(model: () => string) {
  let initial: State = { events: [], limits: {}, blocked: {}, lastError: {} };
  try {
    const saved = JSON.parse(localStorage.getItem("farlands-quota") ?? "null");
    if (
      saved &&
      Array.isArray(saved.events) &&
      saved.limits &&
      saved.blocked &&
      saved.lastError
    )
      initial = saved;
  } catch {}
  const state = ref(initial),
    now = ref(Date.now());
  const timer = setInterval(() => (now.value = Date.now()), 1000);
  onUnmounted(() => clearInterval(timer));
  watch(
    state,
    () => {
      try {
        localStorage.setItem("farlands-quota", JSON.stringify(state.value));
      } catch {}
    },
    { deep: true },
  );
  const limits = computed(() => {
    const m = model();
    return (
      state.value.limits[m] ??
      (state.value.limits[m] = {
        rpm: null,
        rpd: null,
        tpm: null,
        source: "Укажите лимиты из AI Studio",
      })
    );
  });
  const minute = computed(
      () =>
        state.value.events.filter(
          (e) => e.model === model() && now.value - e.at < 60000,
        ).length,
    ),
    day = computed(
      () =>
        state.value.events.filter(
          (e) =>
            e.model === model() && pacificDay(e.at) === pacificDay(now.value),
        ).length,
    );
  const reset = computed(() => nextDailyReset(now.value)),
    cooldown = computed(() =>
      Math.max(0, (state.value.blocked[model()] ?? 0) - now.value),
    );
  function success(m: string) {
    state.value.events = state.value.events.filter(
      (e) => now.value - e.at < 3 * 86400000,
    );
    state.value.events.push({ model: m, at: Date.now() });
    delete state.value.lastError[m];
    delete state.value.blocked[m];
  }
  function failure(
    m: string,
    error: string,
    quota?: {
      retryAfterSeconds: number | null;
      limits: { period: string; kind: string; limit: number }[];
    },
  ) {
    state.value.lastError[m] = error;
    if (!quota) return;
    const limit = state.value.limits[m] ?? {
      rpm: null,
      rpd: null,
      tpm: null,
      source: "",
    };
    for (const v of quota.limits) {
      if (v.kind === "requests") {
        if (v.period === "day") limit.rpd = v.limit;
        else limit.rpm = v.limit;
      } else if (v.period === "minute") limit.tpm = v.limit;
    }
    if (quota.limits.length)
      limit.source = "Из ответа Google при превышении квоты";
    state.value.limits[m] = limit;
    if (quota.retryAfterSeconds !== null)
      state.value.blocked[m] = Date.now() + quota.retryAfterSeconds * 1000;
  }
  return { now, state, limits, minute, day, reset, cooldown, success, failure };
}
