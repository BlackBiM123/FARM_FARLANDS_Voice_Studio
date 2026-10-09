<script setup lang="ts">
import { useQuota, duration } from "../quota";
const props = defineProps<{ model: string }>();
const q = useQuota(() => props.model);
defineExpose({ success: q.success, failure: q.failure, cooldown: q.cooldown });
function setLimit(key: "rpm" | "rpd" | "tpm", e: Event) {
  const value = (e.target as HTMLInputElement).value;
  q.limits.value[key] =
    value === "" ? null : Math.max(0, Math.floor(Number(value)));
  q.limits.value.source = "Лимиты, указанные вами из AI Studio";
}
</script>
<template>
  <section class="quota-panel panel">
    <div class="panel-title">
      <h3>Лимиты и использование</h3>
      <span class="step"
        >FREE TIER · {{ model.includes("lite") ? "FLASH-LITE" : "FLASH" }}</span
      >
    </div>
    <div class="quota-cards">
      <div>
        <small>Дубли за минуту здесь</small
        ><strong
          >{{ q.minute.value }}
          <span>/ {{ q.limits.value.rpm ?? "?" }}</span></strong
        >
        <p>
          Оценка остатка:
          {{
            q.limits.value.rpm === null
              ? "неизвестно"
              : Math.max(0, q.limits.value.rpm - q.minute.value)
          }}
        </p>
      </div>
      <div>
        <small>Дубли за сутки здесь</small
        ><strong
          >{{ q.day.value }}
          <span>/ {{ q.limits.value.rpd ?? "?" }}</span></strong
        >
        <p>
          Оценка остатка:
          {{
            q.limits.value.rpd === null
              ? "неизвестно"
              : Math.max(0, q.limits.value.rpd - q.day.value)
          }}
        </p>
      </div>
      <div>
        <small>Суточный сброс через</small
        ><strong>{{ duration(q.reset.value - q.now.value) }}</strong>
        <p>{{ new Date(q.reset.value).toLocaleString("ru") }} · ваше время</p>
      </div>
    </div>
    <p v-if="q.cooldown.value > 0" class="quota-alert">
      Google рекомендует повторить через {{ duration(q.cooldown.value) }}. Это
      время ожидания, а не гарантия доступности.
    </p>
    <p v-if="q.state.value.lastError[model]" class="hint">
      Последний ответ: {{ q.state.value.lastError[model] }}
    </p>
    <details>
      <summary>Настроить лимиты проекта</summary>
      <div class="fields quota-fields">
        <label
          >Запросов в минуту (RPM)<input
            type="number"
            min="0"
            :value="q.limits.value.rpm ?? ''"
            @input="setLimit('rpm', $event)"
            placeholder="Неизвестно" /></label
        ><label
          >Запросов в день (RPD)<input
            type="number"
            min="0"
            :value="q.limits.value.rpd ?? ''"
            @input="setLimit('rpd', $event)"
            placeholder="Неизвестно" /></label
        ><label
          >Токенов в минуту (TPM)<input
            type="number"
            min="0"
            :value="q.limits.value.tpm ?? ''"
            @input="setLimit('tpm', $event)"
            placeholder="Неизвестно"
        /></label>
      </div>
      <p class="hint">
        {{ q.limits.value.source }}. Остаток токенов неизвестен: расход токенов
        не измеряется этой панелью.
      </p>
    </details>
    <p class="hint">
      Счётчики учитывают успешные дубли в этом браузере, начиная с этого
      обновления. Оценка остатка не учитывает другие вкладки, устройства,
      приложения и отклонённые запросы. Точный остаток по проекту не
      предоставлен TTS API. Суточный сброс — полночь по тихоокеанскому времени
      США.
    </p>
  </section>
</template>
