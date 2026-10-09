<script setup lang="ts">
import { computed, onMounted, onUnmounted, nextTick, ref, watch } from "vue";
import {
  AudioLines,
  Download,
  Search,
  Plus,
  Settings2,
  X,
  Trash2,
  Star,
  Upload,
  ArrowRight,
  Headphones,
} from "lucide-vue-next";
import JSZip from "jszip";
import { initialNPCs } from "./data";
import { loadGameCharacter } from "./storage";
import { gameStyleRule } from "../shared/game-style";
const gameCharacter = ref(loadGameCharacter());
import { loadProject, saveProject, takesDB, type Take } from "./storage";
import { projectSchema, voices, models } from "../shared/schema";
import QuotaPanel from "./components/QuotaPanel.vue";
import UserAdmin from "./components/UserAdmin.vue";
const sessionChecking = ref(true),
  loginUsername = ref(""),
  loginError = ref(""),
  account = ref<{
    id: string;
    username: string;
    role: "admin" | "user";
  } | null>(null),
  usersOpen = ref(false);
import { voiceInfo, genderLabel, emotionPresets } from "./voice-options";
import {
  cloudRequest,
  readCloud,
  uploadTake,
  downloadTake,
  CloudError,
  authenticatedFetch,
} from "./cloud-client";
const cloudConfigured = ref(false),
  cloudReady = ref(false),
  cloudWorking = ref(false),
  cloudConflict = ref(false),
  cloudMessage = ref("Войдите для облачной синхронизации"),
  cloudBytes = ref(0);
let cloudRevision: number | null = null,
  applyingCloud = false,
  cloudTimer: ReturnType<typeof setTimeout> | undefined,
  cloudDirty = false;
try {
  const saved = localStorage.getItem("farlands-cloud-revision");
  cloudRevision = saved === null ? null : Number(saved);
  cloudDirty =
    localStorage.getItem("farlands-cloud-dirty") === "true" ||
    (cloudRevision === null && loadProject(initialNPCs).length > 0);
} catch {}
function snapshotProject() {
  return projectSchema.parse({
    version: 1,
    npcs: npcs.value,
    gameCharacter: gameCharacter.value,
  });
}
function rememberDirty(value: boolean) {
  cloudDirty = value;
  try {
    localStorage.setItem("farlands-cloud-dirty", String(value));
  } catch {}
}
function rememberRevision(value: number) {
  cloudRevision = value;
  try {
    localStorage.setItem("farlands-cloud-revision", String(value));
  } catch {}
}
function scheduleCloud() {
  if (!cloudReady.value || !authenticated.value || cloudConflict.value) return;
  clearTimeout(cloudTimer);
  cloudTimer = setTimeout(() => void pushProject(), 800);
}
onUnmounted(() => clearTimeout(cloudTimer));
async function pushProject() {
  if (
    !cloudReady.value ||
    cloudWorking.value ||
    cloudConflict.value ||
    cloudRevision === null ||
    !cloudDirty
  )
    return;
  let snapshot: ReturnType<typeof snapshotProject>;
  try {
    snapshot = snapshotProject();
  } catch {
    cloudMessage.value =
      "Заполните имя и настройки персонажа для сохранения в облако";
    return;
  }
  cloudWorking.value = true;
  try {
    const data = await cloudRequest("/api/cloud", "PUT", {
      project: snapshot,
      revision: cloudRevision,
    });
    rememberRevision(data.revision);
    rememberDirty(
      JSON.stringify(snapshot) !== JSON.stringify(snapshotProject()),
    );
    cloudMessage.value = cloudDirty
      ? "Есть новые изменения"
      : "Сохранено в облаке";
  } catch (e) {
    cloudMessage.value = e instanceof Error ? e.message : "Ошибка облака";
    if (e instanceof CloudError && e.status === 409) {
      cloudConflict.value = true;
      cloudReady.value = false;
    }
  } finally {
    cloudWorking.value = false;
    if (
      cloudDirty &&
      !cloudConflict.value &&
      cloudMessage.value === "Есть новые изменения"
    )
      scheduleCloud();
  }
}
async function syncCloud(forceLoad = false) {
  if (!authenticated.value || cloudWorking.value) return;
  clearTimeout(cloudTimer);
  cloudWorking.value = true;
  cloudMessage.value = "Проверяю облако…";
  try {
    const data = await readCloud();
    if (!data) {
      cloudMessage.value = "Пока сохраняется в браузере — облако не настроено";
      cloudConfigured.value = false;
      return;
    }
    cloudConfigured.value = true;
    cloudBytes.value = data.storedBytes;
    const local = snapshotProject();
    const different = JSON.stringify(local) !== JSON.stringify(data.project);
    if (
      !forceLoad &&
      different &&
      cloudDirty &&
      data.revision !== 0 &&
      (cloudRevision === null || cloudRevision !== data.revision)
    ) {
      cloudConflict.value = true;
      cloudReady.value = false;
      cloudMessage.value =
        "В облаке другая версия. Локальные изменения сохранены; экспортируйте JSON перед загрузкой облачной версии.";
      return;
    }
    if (forceLoad || !cloudDirty) {
      applyingCloud = true;
      if (forceLoad && different)
        try {
          localStorage.setItem(
            "farlands-before-cloud-load",
            JSON.stringify(local),
          );
        } catch {}
      npcs.value = data.project.npcs;
      gameCharacter.value = data.project.gameCharacter;
      if (!npcs.value.some((n) => n.id === selected.value))
        selected.value = npcs.value[0]?.id ?? "";
      await nextTick();
      applyingCloud = false;
      rememberDirty(false);
    }
    rememberRevision(data.revision);
    cloudConflict.value = false;
    cloudReady.value = true;
    for (const id of data.deletedIds) {
      const t = takes.value.find((x) => x.id === id);
      if (t) {
        await takesDB("delete", undefined, id);
        takes.value = takes.value.filter((x) => x.id !== id);
        if (urls.value[id]?.startsWith("blob:"))
          URL.revokeObjectURL(urls.value[id]!);
        delete urls.value[id];
      }
    }
    for (const meta of data.takes) {
      const cached = takes.value.find((x) => x.id === meta.id);
      const t: Take = {
        ...meta,
        remote: true,
        blob: cached?.blob ?? new Blob([], { type: "audio/wav" }),
      };
      await takesDB("put", t);
      if (cached) Object.assign(cached, t);
      else takes.value.push(t);
      urls.value[t.id] = t.blob.size
        ? (urls.value[t.id] ?? URL.createObjectURL(t.blob))
        : "/api/audio?id=" + t.id;
    }
    for (const t of takes.value.filter((t) => !t.remote && t.blob.size)) {
      await uploadTake(t);
      t.remote = true;
      await takesDB("put", t);
      cloudBytes.value += t.blob.size;
    }
    cloudMessage.value = cloudDirty
      ? "Сохраняю локальные изменения…"
      : "Синхронизировано с облаком";
  } catch (e) {
    cloudMessage.value = e instanceof Error ? e.message : "Облако недоступно";
  } finally {
    applyingCloud = false;
    cloudWorking.value = false;
    if (cloudReady.value && cloudDirty && !cloudConflict.value) scheduleCloud();
  }
}
async function downloadAudio(t: Take) {
  try {
    download(await downloadTake(t), `${t.npcId}_${t.id}.wav`);
  } catch (e) {
    notice.value = e instanceof Error ? e.message : "Ошибка загрузки";
  }
}
const voiceFilter = ref<"all" | "male" | "female">("all");
function visibleVoices(gender: "male" | "female") {
  return voices.filter(
    (v) =>
      voiceInfo[v].gender === gender &&
      (voiceFilter.value === "all" ||
        voiceFilter.value === gender ||
        v === npc.value?.settings.voice),
  );
}
function filterVoices(gender: "all" | "male" | "female") {
  voiceFilter.value = gender;
  if (
    npc.value &&
    gender !== "all" &&
    voiceInfo[npc.value.settings.voice].gender !== gender
  ) {
    npc.value.settings.voice = voices.find(
      (v) => voiceInfo[v].gender === gender,
    )!;
  }
}
const quotaPanel = ref<InstanceType<typeof QuotaPanel> | null>(null);
const authenticated = ref(false),
  loginBusy = ref(false);
async function login() {
  loginBusy.value = true;
  try {
    const r = await fetch("/api/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: loginUsername.value,
        password: token.value,
      }),
    });
    const data = await r.json();
    if (!r.ok) throw Error(data.error);
    authenticated.value = true;
    account.value = data.user;
    loginError.value = "";
    token.value = "";
    accessOpen.value = false;
    notice.value = "Вход сохранён на 30 дней в этом браузере";
    await syncCloud();
  } catch (e) {
    loginError.value = e instanceof Error ? e.message : "Ошибка входа";
  } finally {
    loginBusy.value = false;
  }
}
function lostSession() {
  authenticated.value = false;
  account.value = null;
  cloudReady.value = false;
  usersOpen.value = false;
  clearTimeout(cloudTimer);
  loginError.value = "Сессия завершена или доступ отключён. Войдите снова.";
}
onUnmounted(() => window.removeEventListener("studio-auth-lost", lostSession));
async function logout() {
  await fetch("/api/session", { method: "DELETE" });
  authenticated.value = false;
  account.value = null;
  usersOpen.value = false;
  cloudReady.value = false;
  cloudConfigured.value = false;
  cloudMessage.value = "Войдите для облачной синхронизации";
  clearTimeout(cloudTimer);
  accessOpen.value = false;
  token.value = "";
  notice.value = "Вы вышли из студии";
}
const npcs = ref(loadProject(initialNPCs)),
  selected = ref(npcs.value[0]?.id ?? ""),
  query = ref(""),
  language = ref<"ru" | "en">("ru");
const npc = computed(() => npcs.value.find((x) => x.id === selected.value)!),
  filtered = computed(() =>
    npcs.value.filter((x) =>
      (x.name + " " + x.role).toLowerCase().includes(query.value.toLowerCase()),
    ),
  );
const takes = ref<Take[]>([]),
  busy = ref(false),
  notice = ref(""),
  accessOpen = ref(false),
  token = ref(""),
  compare = ref<string[]>([]),
  edit = ref(false),
  tab = ref<"studio" | "casting">("studio");
const urls = ref<Record<string, string>>({});
const currentTakes = computed(() =>
  takes.value
    .filter((t) => t.npcId === selected.value)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
);
const compared = computed(() =>
  takes.value.filter((t) => compare.value.includes(t.id)),
);
watch(
  [npcs, gameCharacter],
  () => {
    try {
      saveProject(npcs.value, gameCharacter.value);
      if (!applyingCloud) {
        rememberDirty(true);
        scheduleCloud();
      }
    } catch {
      notice.value = "Не удалось сохранить настройки. Экспортируйте JSON.";
    }
  },
  { deep: true },
);
onMounted(async () => {
  window.addEventListener("studio-auth-lost", lostSession);
  try {
    const r = await fetch("/api/session");
    const data = await r.json();
    authenticated.value = data.authenticated === true;
    account.value = data.user ?? null;
  } catch {}
  sessionChecking.value = false;
  try {
    takes.value = await takesDB("read");
    takes.value.forEach(
      (t) =>
        (urls.value[t.id] = t.blob.size
          ? URL.createObjectURL(t.blob)
          : "/api/audio?id=" + t.id),
    );
  } catch {
    notice.value = "Хранилище аудио недоступно в этом браузере.";
  }
  if (authenticated.value) await syncCloud();
});
function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function exportProject() {
  download(
    new Blob(
      [
        JSON.stringify(
          { version: 1, npcs: npcs.value, gameCharacter: gameCharacter.value },
          null,
          2,
        ),
      ],
      {
        type: "application/json",
      },
    ),
    "farlands-project.json",
  );
}
async function importProject(e: Event) {
  const input = e.target as HTMLInputElement,
    file = input.files?.[0];
  if (!file) return;
  try {
    if (file.size > 1000000) throw Error();
    const data = projectSchema.parse(JSON.parse(await file.text()));
    npcs.value = data.npcs;
    gameCharacter.value = data.gameCharacter;
    selected.value = data.npcs[0]?.id ?? "";
    notice.value = "Проект импортирован";
  } catch {
    notice.value = "Некорректный файл проекта";
  }
  input.value = "";
}
function addNPC() {
  const id = "npc_" + crypto.randomUUID().slice(0, 8);
  npcs.value.push({
    id,
    name: "Новый персонаж",
    role: "NPC",
    text: "",
    settings: {
      voice: "Kore",
      model: models[0],
      emotion: "Спокойная",
      pace: 1,
      direction: "",
    },
  });
  selected.value = id;
  edit.value = true;
  tab.value = "studio";
}
async function generate() {
  if ((quotaPanel.value?.cooldown ?? 0) > 0) {
    notice.value = "Дождитесь окончания времени ожидания в панели лимитов";
    return;
  }
  if (!authenticated.value) {
    accessOpen.value = true;
    return;
  }
  busy.value = true;
  notice.value = "";
  const snapshot = {
    npcId: npc.value.id,
    text: npc.value.text,
    settings: structuredClone({ ...npc.value.settings }),
    language: language.value,
    gameCharacter: gameCharacter.value,
  };
  try {
    const r = await authenticatedFetch("/api/tts", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        ...snapshot.settings,
        text: snapshot.text,
        language: snapshot.language,
        gameCharacter: snapshot.gameCharacter,
      }),
    });
    if (!r.ok) {
      const data = await r.json();
      if (r.status === 401) {
        authenticated.value = false;
        account.value = null;
        accessOpen.value = true;
      }
      if (r.status === 429)
        quotaPanel.value?.failure(
          snapshot.settings.model,
          data.error,
          data.quota,
        );
      throw Error(data.error ?? "Ошибка генерации");
    }
    quotaPanel.value?.success(snapshot.settings.model);
    const take: Take = {
      ...snapshot,
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      blob: await r.blob(),
      favorite: false,
    };
    await takesDB("put", take);
    takes.value.push(take);
    urls.value[take.id] = URL.createObjectURL(take.blob);
    notice.value = "Дубль сохранён в этом браузере";
    if (cloudReady.value) {
      try {
        await uploadTake(take);
        take.remote = true;
        await takesDB("put", take);
        cloudBytes.value += take.blob.size;
        notice.value = "Дубль сохранён в облаке и в браузере";
      } catch (e) {
        cloudMessage.value = e instanceof Error ? e.message : "Ошибка облака";
        notice.value =
          "Дубль сохранён в браузере. Нажмите «Синхронизировать» для загрузки в облако.";
      }
    }
  } catch (e) {
    notice.value = e instanceof Error ? e.message : "Ошибка генерации";
  } finally {
    busy.value = false;
  }
}
async function removeTake(t: Take) {
  try {
    if (t.remote) await cloudRequest("/api/cloud", "DELETE", { id: t.id });
    await takesDB("delete", undefined, t.id);
    takes.value = takes.value.filter((x) => x.id !== t.id);
    compare.value = compare.value.filter((x) => x !== t.id);
    URL.revokeObjectURL(urls.value[t.id]!);
    delete urls.value[t.id];
  } catch {
    notice.value = "Не удалось удалить дубль";
  }
}
async function favorite(t: Take) {
  try {
    if (t.remote)
      await cloudRequest("/api/cloud", "PATCH", {
        id: t.id,
        favorite: !t.favorite,
      });
    await takesDB("put", { ...t, favorite: !t.favorite });
    t.favorite = !t.favorite;
  } catch {
    notice.value = "Не удалось сохранить выбор";
  }
}
function toggleCompare(id: string) {
  if (compare.value.includes(id))
    compare.value = compare.value.filter((x) => x !== id);
  else if (compare.value.length < 2) compare.value.push(id);
  else notice.value = "Для сравнения выберите два дубля";
}
async function exportGodot() {
  try {
    const zip = new JSZip();
    const manifest = {
      version: 1,
      project: "FARM & FARLANDS",
      audio_format: "wav",
      game_character: gameCharacter.value,
      npcs: npcs.value,
      takes: takes.value.map((t) => ({
        id: t.id,
        npc_id: t.npcId,
        text: t.text,
        settings: t.settings,
        language: t.language,
        game_character: t.gameCharacter ?? null,
        favorite: t.favorite,
        created_at: t.createdAt,
        audio: `res://voice/audio/${t.npcId}_${t.id}.wav`,
      })),
    };
    for (const t of takes.value)
      zip.file(`voice/audio/${t.npcId}_${t.id}.wav`, await downloadTake(t));
    zip.file("voice/manifest.json", JSON.stringify(manifest, null, 2));
    zip.file(
      "voice/README.txt",
      "Copy voice/ into your Godot project. Read manifest.json with JSON.parse_string; load the audio path with load(). Audio is 24 kHz mono WAV.",
    );
    download(await zip.generateAsync({ type: "blob" }), "farlands-godot.zip");
    notice.value = "Пакет Godot экспортирован";
  } catch {
    notice.value = "Не удалось экспортировать пакет";
  }
}
function pauseOthers(e: Event) {
  document.querySelectorAll("audio").forEach((a) => {
    if (a !== e.target) a.pause();
  });
}
</script>

<template>
  <div v-if="sessionChecking" class="login-shell"><p>Проверка входа…</p></div>
  <section v-else-if="!authenticated" class="login-shell">
    <form class="login-card panel" @submit.prevent="login">
      <span class="eyebrow">FARM & FARLANDS</span>
      <h1>Voice Studio</h1>
      <p>Закрытая студия озвучки. Войдите в свою учётную запись.</p>
      <label
        >Логин<input
          v-model="loginUsername"
          required
          autocomplete="username"
          maxlength="32" /></label
      ><label
        >Пароль<input
          v-model="token"
          type="password"
          required
          autocomplete="current-password"
          maxlength="128"
      /></label>
      <p v-if="loginError" class="login-error" role="alert">{{ loginError }}</p>
      <button class="primary" :disabled="loginBusy">
        {{ loginBusy ? "Вход…" : "Войти" }}</button
      ><small>Доступ выдаёт администратор студии.</small>
    </form>
  </section>
  <div v-else class="studio">
    <header>
      <div>
        <span class="eyebrow">FARM & FARLANDS / AUDIO DEPARTMENT</span>
        <h1>Voice Studio<span class="crosshair">⌖</span></h1>
      </div>
      <div class="header-actions">
        <button @click="accessOpen = true">
          <Settings2 :size="15" />
          {{ account?.username ?? "Учётная запись" }}</button
        ><button @click="exportProject"><Download :size="15" /> JSON</button
        ><button class="primary" @click="exportGodot">
          <Download :size="15" /> Экспорт в Godot
        </button>
      </div>
    </header>
    <nav>
      <button :class="{ chosen: tab === 'studio' }" @click="tab = 'studio'">
        <AudioLines :size="16" /> Студия</button
      ><button :class="{ chosen: tab === 'casting' }" @click="tab = 'casting'">
        Кастинг озвучки</button
      ><span>GOOGLE · GEMINI 3.8 FLASH TTS</span
      ><small
        >{{ npcs.length }} ПЕРСОНАЖЕЙ ·
        {{ cloudConfigured ? "ОБЛАЧНЫЙ ПРОЕКТ" : "ЛОКАЛЬНЫЙ ПРОЕКТ" }}</small
      >
    </nav>
    <div v-if="account?.role === 'admin'" class="admin-toolbar">
      <button @click="usersOpen = !usersOpen">
        {{ usersOpen ? "Закрыть пользователей" : "Пользователи" }}</button
      ><span>Администратор</span>
    </div>
    <UserAdmin
      v-if="usersOpen && account?.role === 'admin'"
      :current-id="account.id"
    />
    <section class="cloud-status panel">
      <div>
        <strong>{{
          cloudConfigured
            ? "Облачное сохранение · Supabase"
            : "Сохранение проекта"
        }}</strong>
        <p role="status">
          {{ cloudWorking ? "Синхронизация…" : cloudMessage }}
        </p>
        <small v-if="cloudConfigured"
          >Аудио в облаке: {{ (cloudBytes / 1000000).toFixed(1) }} МБ ·
          бесплатное хранилище 1 ГБ</small
        >
      </div>
      <div class="cloud-actions">
        <button :disabled="cloudWorking || !authenticated" @click="syncCloud()">
          Синхронизировать</button
        ><template v-if="cloudConflict"
          ><button @click="exportProject">Скачать локальный JSON</button
          ><button :disabled="cloudWorking" @click="syncCloud(true)">
            Загрузить облачную версию
          </button></template
        >
      </div>
    </section>
    <section class="game-style panel">
      <label class="game-style-toggle"
        ><input v-model="gameCharacter" type="checkbox" /><span
          ><strong>Персонаж Farm & Farlands</strong
          ><small
            >Общее правило для всех генераций: живые герои уютного мира фермы,
            торговли, тайн и приключений.</small
          ></span
        ></label
      >
      <details>
        <summary>
          Правило подачи {{ gameCharacter ? "включено" : "выключено" }}
        </summary>
        <p>{{ gameStyleRule }}</p>
      </details>
    </section>
    <section v-if="tab === 'casting'" class="casting">
      <div class="section-heading">
        <span class="eyebrow">КАСТИНГ ОЗВУЧКИ</span
        ><button @click="addNPC"><Plus :size="15" /> Персонаж</button>
      </div>
      <p v-if="!npcs.length" class="cast-empty">
        Каталог пока пуст. Добавьте персонажа, чтобы начать кастинг голоса.
      </p>
      <div v-else class="cast-head">
        <span>ПЕРСОНАЖ</span><span>ГОЛОС GOOGLE</span
        ><span>СТИЛЬ И ИНТОНАЦИЯ</span>
      </div>
      <button
        v-for="(n, i) in npcs"
        :key="n.id"
        class="cast-row"
        @click="
          selected = n.id;
          tab = 'studio';
        "
      >
        <span class="cast-name"
          ><span class="portrait small-portrait">{{
            String(i + 1).padStart(2, "0")
          }}</span
          ><span
            ><strong>{{ n.name }}</strong
            ><small>{{ n.role }}</small></span
          ></span
        ><span class="cast-voice"
          ><ArrowRight :size="20" /><strong>{{
            n.settings.voice
          }}</strong></span
        ><em>{{ n.settings.direction }}</em>
      </button>
    </section>
    <div v-else class="layout">
      <aside class="catalog panel">
        <div class="panel-title">
          <h3>
            Персонажи <small>{{ npcs.length }}</small>
          </h3>
          <button class="icon" @click="addNPC" aria-label="Добавить NPC">
            <Plus :size="18" />
          </button>
        </div>
        <label class="search"
          ><Search :size="15" /><input
            v-model="query"
            placeholder="Найти персонажа"
            aria-label="Поиск NPC" /></label
        ><button
          v-for="(n, i) in filtered"
          :key="n.id"
          class="npc-row"
          :class="{ active: selected === n.id }"
          @click="
            selected = n.id;
            edit = false;
          "
        >
          <span class="portrait small-portrait">{{
            String(i + 1).padStart(2, "0")
          }}</span
          ><span
            ><strong>{{ n.name }}</strong
            ><small>{{ n.role }}</small></span
          ><i v-if="takes.some((t) => t.npcId === n.id)" />
        </button>
        <p v-if="!filtered.length" class="hint">Никого не найдено</p>
        <label class="import"
          ><Upload :size="14" /> Импорт проекта<input
            type="file"
            accept="application/json,.json"
            @change="importProject"
        /></label>
      </aside>
      <main v-if="npc" class="editor">
        <section class="character panel">
          <div class="character-top">
            <div class="portrait">{{ npc.name.slice(0, 1) }}</div>
            <div>
              <span class="eyebrow">ПРОФИЛЬ ПЕРСОНАЖА</span>
              <h2>{{ npc.name }}</h2>
              <p>{{ npc.role }}</p>
            </div>
            <button
              class="icon ml-auto"
              @click="edit = !edit"
              aria-label="Редактировать персонажа"
            >
              <Settings2 :size="17" />
            </button>
          </div>
          <div v-if="edit" class="fields">
            <label>Имя<input v-model="npc.name" maxlength="80" /></label
            ><label>Роль<input v-model="npc.role" maxlength="120" /></label>
          </div>
          <p class="character-direction">{{ npc.settings.direction }}</p>
        </section>
        <section class="panel settings">
          <div class="panel-title">
            <h3>Кастинг голоса</h3>
            <span class="step">01 / VOICE</span>
          </div>
          <div class="fields">
            <label
              >Голос Gemini<select v-model="npc.settings.voice">
                <optgroup
                  v-for="gender in ['female', 'male'] as const"
                  :key="gender"
                  :label="
                    gender === 'female' ? 'Женские · Female' : 'Мужские · Male'
                  "
                >
                  <option
                    v-for="v in visibleVoices(gender)"
                    :key="v"
                    :value="v"
                  >
                    {{ v }} — {{ genderLabel(v) }} ·
                    {{ voiceInfo[v].character }}
                  </option>
                </optgroup>
              </select></label
            ><label
              >Модель<select v-model="npc.settings.model">
                <option v-for="m in models" :value="m" :key="m">
                  {{
                    m.includes("lite")
                      ? "Gemini 3.8 Flash-Lite TTS"
                      : "Gemini 3.8 Flash TTS"
                  }}
                </option>
              </select></label
            >
          </div>
          <div class="voice-filter" role="group" aria-label="Фильтр голосов">
            <button
              type="button"
              :aria-pressed="voiceFilter === 'all'"
              @click="filterVoices('all')"
            >
              Все голоса</button
            ><button
              type="button"
              :aria-pressed="voiceFilter === 'male'"
              @click="filterVoices('male')"
            >
              Мужские · Male</button
            ><button
              type="button"
              :aria-pressed="voiceFilter === 'female'"
              @click="filterVoices('female')"
            >
              Женские · Female
            </button>
          </div>
          <p class="voice-description">
            <span
              class="gender-tag"
              :class="voiceInfo[npc.settings.voice].gender"
              >{{ genderLabel(npc.settings.voice) }}</span
            >
            {{ voiceInfo[npc.settings.voice].character }}
          </p>
          <div class="emotion-heading">
            <h3>Пресеты эмоций</h3>
            <small>Выберите подачу одним нажатием</small>
          </div>
          <div class="emotion-presets" role="group" aria-label="Пресеты эмоций">
            <button
              v-for="preset in emotionPresets"
              :key="preset.label"
              type="button"
              :aria-pressed="npc.settings.emotion === preset.emotion"
              @click="npc.settings.emotion = preset.emotion"
            >
              {{ preset.label }}
            </button>
          </div>
          <label
            >Эмоция и настроение<input
              v-model="npc.settings.emotion"
              maxlength="100" /></label
          ><label class="range-label"
            >Темп речи <span>{{ npc.settings.pace.toFixed(2) }}×</span
            ><input
              v-model.number="npc.settings.pace"
              type="range"
              min="0.5"
              max="1.5"
              step="0.05" /></label
          ><label
            >Режиссёрские указания<textarea
              v-model="npc.settings.direction"
              rows="2"
              maxlength="1000"
            />
          </label>
          <p class="hint">
            Темп и стиль — указания модели, точное соблюдение не гарантируется.
          </p>
        </section>
        <section class="panel script">
          <div class="panel-title">
            <h3>Тестовая реплика</h3>
            <select
              v-model="language"
              aria-label="Язык реплики"
              class="language"
            >
              <option value="ru">RU</option>
              <option value="en">EN</option>
            </select>
          </div>
          <textarea
            v-model="npc.text"
            maxlength="600"
            rows="4"
            aria-label="Текст реплики"
          />
          <div class="script-footer">
            <span>{{ npc.text.length }} / 600 символов</span
            ><button
              class="primary"
              :disabled="
                busy || !npc.text.trim() || (quotaPanel?.cooldown ?? 0) > 0
              "
              @click="generate"
            >
              <AudioLines :size="17" />{{
                busy ? "Генерация…" : "Создать дубль"
              }}
            </button>
          </div>
          <p class="hint">
            API может тарифицироваться. Проверьте квоты проекта в Google AI
            Studio.
          </p>
        </section>
      </main>
      <main v-else class="editor panel empty-project">
        <AudioLines :size="40" /><span class="eyebrow"
          >ВАША СТУДИЯ ГОЛОСОВ</span
        >
        <h2>Начните с персонажа</h2>
        <p>
          Добавьте NPC, выберите голос и напишите первую реплику.<br />Здесь
          будут ваши персонажи, ваши настройки и ваши дубли.
        </p>
        <button class="primary" @click="addNPC">
          <Plus :size="16" /> Добавить персонажа
        </button>
      </main>
      <aside class="takes panel">
        <div class="panel-title">
          <h3>
            <Headphones :size="17" /> Дубли
            <small>{{ currentTakes.length }}</small>
          </h3>
        </div>
        <p class="subtitle">Слушайте. Сравнивайте. Выбирайте.</p>
        <div v-if="!currentTakes.length" class="takes-empty">
          <div class="wave">
            <span
              v-for="i in 21"
              :key="i"
              :style="{ height: 10 + Math.sin(i * 1.7) ** 2 * 38 + 'px' }"
            />
          </div>
          <h4>Голос ещё не записан</h4>
          <p>Создайте первый дубль и найдите звучание своего персонажа.</p>
          <span class="pill">WAV · 24 kHz · MONO</span>
        </div>
        <article v-for="(t, i) in currentTakes" :key="t.id" class="take">
          <div class="take-title">
            <strong>Дубль {{ currentTakes.length - i }}</strong
            ><button
              class="icon"
              @click="favorite(t)"
              aria-label="Выбрать дубль"
              :class="{ gold: t.favorite }"
            >
              <Star :size="16" :fill="t.favorite ? 'currentColor' : 'none'" />
            </button>
          </div>
          <small
            >{{ t.settings.voice }} · {{ t.settings.pace }}× ·
            {{ new Date(t.createdAt).toLocaleTimeString("ru") }}</small
          >
          <p>{{ t.text }}</p>
          <audio
            controls
            preload="none"
            :src="urls[t.id]"
            @play="pauseOthers"
          />
          <div class="take-actions">
            <label
              ><input
                type="checkbox"
                :checked="compare.includes(t.id)"
                @change="toggleCompare(t.id)"
              />
              Сравнить</label
            ><button
              class="icon"
              @click="downloadAudio(t)"
              aria-label="Скачать WAV"
            >
              <Download :size="16" /></button
            ><button
              class="icon"
              @click="removeTake(t)"
              aria-label="Удалить дубль"
            >
              <Trash2 :size="15" />
            </button>
          </div>
        </article>
        <p class="takes-note">
          {{
            cloudConfigured
              ? "Настройки и дубли синхронизируются с облаком. Статус сохранения — вверху страницы."
              : "Настройки и аудио сохраняются в этом браузере."
          }}
          Экспортируйте пакет Godot для резервной копии.
        </p>
      </aside>
    </div>
    <QuotaPanel ref="quotaPanel" :model="npc?.settings.model ?? models[0]" />
    <footer><span>FARM & FARLANDS</span><span>VOICE STUDIO</span></footer>
    <div v-if="notice" class="toast" role="status">
      {{ notice
      }}<button
        class="icon"
        @click="notice = ''"
        aria-label="Закрыть уведомление"
      >
        <X :size="16" />
      </button>
    </div>
    <div v-if="accessOpen" class="overlay" @click.self="accessOpen = false">
      <section
        class="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="access-title"
      >
        <button
          class="icon close"
          @click="accessOpen = false"
          aria-label="Закрыть"
        >
          <X />
        </button>
        <h2 id="access-title">Учётная запись</h2>
        <template v-if="authenticated"
          ><p>
            Вы вошли как {{ account?.username }}. Роль:
            {{ account?.role === "admin" ? "администратор" : "пользователь" }}.
            Вход сохраняется в этом браузере.
          </p>
          <button @click="logout">Выйти из студии</button></template
        >
      </section>
    </div>
    <div v-if="compared.length" class="compare">
      <div class="panel-title">
        <h3>Сравнение A / B</h3>
        <button
          class="icon"
          @click="compare = []"
          aria-label="Закрыть сравнение"
        >
          <X />
        </button>
      </div>
      <div class="compare-grid">
        <div v-for="(t, i) in compared" :key="t.id">
          <strong
            >{{ i ? "B" : "A" }} · {{ t.settings.voice }} ·
            {{ t.settings.emotion }}</strong
          ><audio
            controls
            preload="none"
            :src="urls[t.id]"
            @play="pauseOthers"
          />
        </div>
      </div>
    </div>
  </div>
</template>
