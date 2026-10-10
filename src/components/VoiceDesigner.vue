<script setup lang="ts">
import { ref, onUnmounted } from "vue";
import { cloudRequest, authenticatedFetch } from "../cloud-client";
import {
  childVoiceDesigns,
  type DesignedVoice,
} from "../../shared/designed-voice";
const emit = defineEmits<{ select: [voice: DesignedVoice] }>();
const name = ref(childVoiceDesigns[0]!.name),
  description = ref(childVoiceDesigns[0]!.description),
  gender = ref<"female" | "male" | "neutral">("female"),
  language = ref("ru-RU");
const voices = ref<DesignedVoice[]>([]),
  busy = ref(false),
  loaded = ref(false),
  message = ref(""),
  sampleUrls = ref<Record<string, string>>({});
async function refresh() {
  busy.value = true;
  message.value = "";
  try {
    const data = await cloudRequest("/api/voices");
    voices.value = data.voices;
    loaded.value = true;
    if (data.nextPageToken) message.value = "Показаны первые 200 голосов.";
  } catch (e) {
    message.value =
      e instanceof Error ? e.message : "Не удалось загрузить голоса";
  } finally {
    busy.value = false;
  }
}
async function create() {
  busy.value = true;
  message.value = "";
  try {
    const data = await cloudRequest("/api/voices", "POST", {
      name: name.value,
      description: description.value,
      gender: gender.value,
      language: language.value,
    });
    voices.value = [data.voice, ...voices.value];
    loaded.value = true;
    message.value =
      "Тембр создан. Прослушайте пример и выберите голос для персонажа.";
  } catch (e) {
    message.value = e instanceof Error ? e.message : "Не удалось создать голос";
  } finally {
    busy.value = false;
  }
}
async function preview(id: string) {
  busy.value = true;
  message.value = "";
  try {
    const r = await authenticatedFetch(
      "/api/voices?id=" + encodeURIComponent(id),
    );
    if (!r.ok) {
      const data = await r.json();
      throw Error(data.error || "Нет аудиопримера");
    }
    sampleUrls.value[id] = URL.createObjectURL(await r.blob());
  } catch (e) {
    message.value =
      e instanceof Error ? e.message : "Не удалось загрузить пример";
  } finally {
    busy.value = false;
  }
}
onUnmounted(() => Object.values(sampleUrls.value).forEach(URL.revokeObjectURL));
</script>
<template>
  <details
    class="voice-designer"
    @toggle="
      (e) => {
        if ((e.target as HTMLDetailsElement).open && !loaded && !busy)
          refresh();
      }
    "
  >
    <summary>Создать свой тембр · Voice Design</summary>
    <p class="hint">
      Возраст и тембр задаются при создании голоса. Эмоции меняются отдельно для
      каждой реплики. Детское звучание оценивайте по аудио, оно не
      гарантируется. Google может блокировать детские описания по правилам Voice
      Design.
    </p>
    <div class="designer-presets">
      <button
        v-for="(v, i) in childVoiceDesigns"
        :key="v.name"
        type="button"
        :disabled="busy"
        @click="
          name = v.name;
          description = v.description;
          gender = v.gender;
        "
      >
        8 лет · {{ ["Любопытная", "Спокойная", "Озорная"][i] }}
      </button>
    </div>
    <label>Название тембра<input v-model="name" maxlength="80" /></label>
    <div class="fields">
      <label
        >Пол голоса<select v-model="gender">
          <option value="female">Женский</option>
          <option value="male">Мужской</option>
          <option value="neutral">Нейтральный</option>
        </select></label
      ><label
        >Язык тембра<select v-model="language">
          <option value="ru-RU">Русский</option>
          <option value="en-US">English</option>
        </select></label
      >
    </div>
    <label
      >Описание нового тембра<textarea
        v-model="description"
        rows="5"
        maxlength="1500"
      />
    </label>
    <p class="hint">
      Создание расходует квоту Gemini. Бесплатность зависит от доступа вашего
      проекта; студия не подключает биллинг. Сохранённые тембры могут истекать —
      дата указана у голоса.
    </p>
    <div class="designer-actions">
      <button
        type="button"
        :disabled="busy || !name.trim() || description.trim().length < 10"
        @click="create"
      >
        {{ busy ? "Подождите…" : "Создать тембр" }}</button
      ><button type="button" :disabled="busy" @click="refresh">
        Обновить голоса
      </button>
    </div>
    <p v-if="message" role="status">{{ message }}</p>
    <article v-for="v in voices" :key="v.id" class="designed-voice">
      <strong>{{ v.name }}</strong
      ><small
        >{{
          v.gender === "female"
            ? "Женский"
            : v.gender === "male"
              ? "Мужской"
              : "Нейтральный"
        }}
        · Собственный тембр</small
      >
      <p>{{ v.description }}</p>
      <small v-if="v.expiresAt"
        >Срок действия:
        {{ new Date(v.expiresAt).toLocaleDateString("ru-RU") }}</small
      >
      <div class="designer-actions">
        <button
          v-if="!sampleUrls[v.id]"
          type="button"
          :disabled="busy"
          @click="preview(v.id)"
        >
          Загрузить пример</button
        ><button type="button" :disabled="busy" @click="emit('select', v)">
          Выбрать для персонажа
        </button>
      </div>
      <audio
        v-if="sampleUrls[v.id]"
        :src="sampleUrls[v.id]"
        controls
        preload="metadata"
      />
    </article>
    <p v-if="loaded && !voices.length && !message" class="hint">
      Собственных тембров пока нет.
    </p>
  </details>
</template>
<style scoped>
.voice-designer {
  margin-top: 20px;
  padding: 16px;
  border: 1px solid var(--border, #3c4147);
  border-radius: 10px;
}
.voice-designer summary {
  cursor: pointer;
  color: #f4c064;
  font-weight: 600;
}
.voice-designer label {
  display: block;
  margin: 14px 0;
}
.voice-designer .hint {
  margin: 14px 0;
  line-height: 1.6;
}
.designer-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin: 14px 0;
}
.designer-actions button {
  padding: 10px 12px;
}
.designed-voice {
  border-top: 1px solid #3c4147;
  margin-top: 20px;
  padding-top: 16px;
}
.designed-voice strong,
.designed-voice small {
  display: block;
  margin-bottom: 8px;
}
.designed-voice p {
  line-height: 1.5;
  overflow-wrap: anywhere;
}
.designed-voice audio {
  width: 100%;
  margin-top: 10px;
}
.designer-presets {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 16px;
}
</style>
