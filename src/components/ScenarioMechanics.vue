<script setup lang="ts">
import { ref, computed, watch } from "vue";
import type { Scenario, DialogueLine } from "../../shared/content";
import type { NPC } from "../../shared/schema";
import {
  outcomeSchema,
  obligationSchema,
  eventClasses,
  eventClassLabels,
  expiryActions,
  expiryActionLabels,
  repeatPolicies,
  repeatPolicyLabels,
  recheckEvents,
  recheckLabels,
  parseFacts,
} from "../../shared/scenario-mechanics";
import {
  applyConfirmedOutcome,
  type Occurrence,
  type RelationshipValues,
} from "../../shared/scenario-runtime";
const props = defineProps<{
  scenario: Scenario;
  npcs: NPC[];
  lines: DialogueLine[];
}>();
const message = ref(""),
  outcomeId = ref(""),
  confirmedFacts = ref<string[]>([]),
  ledger = ref<string[]>([]),
  values = ref<RelationshipValues>({}),
  chosen = ref<string | null>(null);
const previewFacts = computed(() => [
  ...new Set([
    ...props.scenario.outcomes.flatMap((o) => o.requiredFacts),
    ...props.scenario.effects.flatMap((e) => e.requiredFacts),
  ]),
]);
function addFact() {
  props.scenario.facts.push({
    key: "fact_" + crypto.randomUUID().slice(0, 8),
    label: "Новый факт",
    description: "",
  });
}
function addOutcome() {
  if (props.scenario.outcomes.length >= 20) return;
  const id = crypto.randomUUID();
  props.scenario.outcomes.push(
    outcomeSchema.parse({
      id,
      key: "outcome_" + id.slice(0, 8),
      label: "Новый исход",
    }),
  );
}
function removeOutcome(id: string) {
  const s = props.scenario;
  if (
    s.effects.some((e) => e.outcomeIds.includes(id)) ||
    s.obligations.some((o) => o.createdByOutcomeId === id) ||
    props.lines.some((l) => l.scenarioId === s.id && l.outcomeIds.includes(id))
  ) {
    message.value =
      "Сначала отвяжите последствия, обязательства и реплики от этого исхода.";
    return;
  }
  s.outcomes = s.outcomes.filter((o) => o.id !== id);
}
function addObligation() {
  if (props.scenario.obligations.length >= 20) return;
  const id = crypto.randomUUID();
  props.scenario.obligations.push(
    obligationSchema.parse({
      id,
      key: "promise_" + id.slice(0, 8),
      title: "Новое обещание",
      fromId: props.scenario.initiatorId,
      toId: props.scenario.targets[0] ?? null,
    }),
  );
}
function resetPreview() {
  ledger.value = [];
  chosen.value = null;
  confirmedFacts.value = [];
  values.value = Object.fromEntries(
    props.npcs.flatMap((n) =>
      n.profile.relationships
        .filter((r) => r.otherId)
        .map((r) => [
          n.id + ":" + r.otherId,
          {
            trust: r.trust,
            affection: r.affection,
            respect: r.respect,
            tension: r.tension,
          },
        ]),
    ),
  );
  message.value = "Проверка сброшена. Анкеты персонажей не изменяются.";
}
watch(
  () => props.scenario.id,
  () => {
    outcomeId.value = "";
    resetPreview();
  },
  { immediate: true },
);
function applyPreview() {
  try {
    const event: Occurrence = {
      id: "preview-" + props.scenario.id,
      scenarioId: props.scenario.id,
      contextKey: "preview",
      createdAt: 0,
      expiresAt: 168,
      stage: chosen.value ? "resolved" : "playing",
      outcomeId: chosen.value,
    };
    const r = applyConfirmedOutcome(
      props.scenario,
      event,
      outcomeId.value,
      confirmedFacts.value,
      ledger.value,
      values.value,
    );
    ledger.value = r.ledger;
    values.value = r.values;
    chosen.value = r.event.outcomeId;
    message.value = `Проверка: применено ${r.applied.length}, ждут подтверждения фактов ${r.pending.length}. Повторное подтверждение не начисляет те же изменения снова.`;
  } catch (e) {
    message.value = e instanceof Error ? e.message : "Ошибка проверки";
  }
}
function toggleFact(key: string) {
  confirmedFacts.value = confirmedFacts.value.includes(key)
    ? confirmedFacts.value.filter((x) => x !== key)
    : [...confirmedFacts.value, key];
}
</script>
<template>
  <section class="story-section scenario-mechanics">
    <h4>Жизненный цикл и время события</h4>
    <p class="hint">
      Событие ожидает дни, а сцена проводится в подходящие часы. Статус карточки
      на доске — авторский; игровое состояние экземпляра хранится отдельно.
    </p>
    <div class="event-phase-strip">
      <span>Подготовлено · ожидает</span><b>→</b><span>Сцена разыгрывается</span
      ><b>→</b><span>Решение / последствия</span>
    </div>
    <div class="story-field-grid">
      <label
        >Ключ сценария<input
          v-model="scenario.key"
          maxlength="80"
          placeholder="например: vale_leo_future"
      /></label>
      <label
        >Значимость события<select v-model="scenario.mechanics.eventClass">
          <option v-for="v in eventClasses" :key="v" :value="v">
            {{ eventClassLabels[v] }}
          </option>
        </select></label
      ><label
        >Ключ триггера<input
          v-model="scenario.mechanics.triggerKey"
          maxlength="100"
          placeholder="например: family_harvest_added" /></label
      ><label
        >Окно актуальности: минимум дней<input
          v-model.number="scenario.mechanics.windowDaysMin"
          type="number"
          min="1"
          max="365" /></label
      ><label
        >Окно актуальности: максимум дней<input
          v-model.number="scenario.mechanics.windowDaysMax"
          type="number"
          min="1"
          max="365" /></label
      ><label
        >Сцена не раньше<input
          v-model="scenario.mechanics.preferredStart"
          type="time" /></label
      ><label
        >Сцена до<input
          v-model="scenario.mechanics.preferredEnd"
          type="time" /></label
      ><label
        >Место / ключ локации<input
          v-model="scenario.mechanics.location"
          maxlength="120" /></label
      ><label
        >После истечения окна<select v-model="scenario.mechanics.expiryAction">
          <option v-for="v in expiryActions" :key="v" :value="v">
            {{ expiryActionLabels[v] }}
          </option>
        </select></label
      ><label class="mechanic-check"
        ><input
          v-model="scenario.mechanics.playerRequired"
          type="checkbox"
        />Игрок обязателен для сцены</label
      ><label class="mechanic-check"
        ><input
          v-model="scenario.mechanics.playerCanIntervene"
          type="checkbox"
        />Игрок может вмешаться</label
      ><label class="wide-field"
        >Что происходит без игрока<textarea
          v-model="scenario.mechanics.autonomousResolution"
          maxlength="1500"
          rows="3"
        /></label
      ><label class="wide-field"
        >Когда событие теряет актуальность<textarea
          v-model="scenario.mechanics.invalidation"
          maxlength="1500"
          rows="3"
        /></label
      ><label
        >Повтор события<select v-model="scenario.mechanics.repeatPolicy">
          <option v-for="v in repeatPolicies" :key="v" :value="v">
            {{ repeatPolicyLabels[v] }}
          </option>
        </select></label
      ><label
        >Повторное обсуждение не раньше, часов<input
          v-model.number="scenario.mechanics.followUpCooldownHours"
          type="number"
          min="0"
          max="8760" /></label
      ><label class="wide-field"
        >Что отличает новую ситуацию<textarea
          v-model="scenario.mechanics.contextKeySpec"
          maxlength="1000"
          rows="2"
          placeholder="Новая партия урожая, запись дневника, план производства…"
        /></label
      ><label
        >Ключи взаимоисключения<input
          :value="scenario.mechanics.exclusivityKeys.join(', ')"
          @change="
            scenario.mechanics.exclusivityKeys = parseFacts(
              ($event.target as HTMLInputElement).value,
            )
          " /></label
      ><label
        >Пауза между наблюдаемыми сценами, часов<input
          v-model.number="scenario.mechanics.sceneGapHours"
          type="number"
          min="0"
          max="8760"
      /></label>
    </div>
    <h5>Когда повторно проверять возможность сцены</h5>
    <div class="mechanic-checks">
      <label v-for="v in recheckEvents" :key="v" class="mechanic-check"
        ><input
          v-model="scenario.mechanics.recheckOn"
          type="checkbox"
          :value="v"
        />{{ recheckLabels[v] }}</label
      >
    </div>
    <div class="story-field-grid">
      <label class="wide-field"
        >Следы события и разговоры после возвращения игрока<textarea
          v-model="scenario.mechanics.aftermath"
          maxlength="1500"
          rows="3"
        /></label
      ><label class="wide-field"
        >Замечания к механике / рабочие параметры<textarea
          v-model="scenario.mechanics.notes"
          maxlength="2500"
          rows="4"
        />
      </label>
    </div>
  </section>
  <section class="story-section">
    <div class="section-heading">
      <div>
        <h4>Отдельные исходы</h4>
        <p class="hint">
          Для экземпляра события подтверждается один исход. Его последствия ждут
          указанных фактов, а не проигрывания реплики.
        </p>
      </div>
      <button :disabled="scenario.outcomes.length >= 20" @click="addOutcome">
        Добавить исход
      </button>
    </div>
    <article v-for="o in scenario.outcomes" :key="o.id" class="outcome-card">
      <div class="story-field-grid">
        <label
          >Название исхода<input
            v-model="o.label"
            maxlength="150"
            @blur="o.label = o.label.trim() || 'Без названия'" /></label
        ><label>Ключ исхода<input v-model="o.key" maxlength="100" /></label
        ><label class="wide-field"
          >Описание исхода<textarea
            v-model="o.description"
            maxlength="1500"
            rows="2"
          /></label
        ><label
          >Условия подтверждения<textarea
            v-model="o.conditions"
            maxlength="1000"
            rows="2"
          /></label
        ><label
          >Необходимые подтверждённые факты<input
            :value="o.requiredFacts.join(', ')"
            @change="
              o.requiredFacts = parseFacts(
                ($event.target as HTMLInputElement).value,
              )
            "
        /></label>
      </div>
      <button class="danger" @click="removeOutcome(o.id)">Удалить исход</button>
    </article>
    <p v-if="!scenario.outcomes.length" class="hint">
      Исходов пока нет. Последствия без привязки к исходу не применяются
      автоматически.
    </p>
  </section>
  <section class="story-section">
    <div class="section-heading">
      <div>
        <h4>Обещания и обязательства</h4>
        <p class="hint">
          Состояния в игре: создано → ожидает → выполнено / перенесено /
          нарушено. Факт обещания и факт его исполнения различаются.
        </p>
      </div>
      <button
        :disabled="scenario.obligations.length >= 20"
        @click="addObligation"
      >
        Добавить обязательство
      </button>
    </div>
    <article v-for="o in scenario.obligations" :key="o.id" class="outcome-card">
      <div class="story-field-grid">
        <label
          >Обещание / обязательство<input
            v-model="o.title"
            maxlength="150"
            @blur="o.title = o.title.trim() || 'Без названия'" /></label
        ><label
          >Ключ обязательства<input v-model="o.key" maxlength="100" /></label
        ><label
          >Кто обещал<select v-model="o.fromId">
            <option :value="null">Не выбран</option>
            <option v-for="n in npcs" :key="n.id" :value="n.id">
              {{ n.name }}
            </option>
          </select></label
        ><label
          >Кому обещал<select v-model="o.toId">
            <option :value="null">Не выбран</option>
            <option v-for="n in npcs" :key="n.id" :value="n.id">
              {{ n.name }}
            </option>
          </select></label
        ><label
          >Создаётся при исходе<select v-model="o.createdByOutcomeId">
            <option :value="null">Пока не привязано</option>
            <option
              v-for="branch in scenario.outcomes"
              :key="branch.id"
              :value="branch.id"
            >
              {{ branch.label }}
            </option>
          </select></label
        ><label
          >Срок, дней · пусто, если не определён<input
            v-model.number="o.dueDays"
            type="number"
            min="0"
            max="365"
            @change="
              o.dueDays =
                ($event.target as HTMLInputElement).value === ''
                  ? null
                  : Number(($event.target as HTMLInputElement).value)
            " /></label
        ><label
          >Факт данного обещания<input
            v-model="o.createdFact"
            maxlength="100" /></label
        ><label
          >Факт выполнения<input
            v-model="o.fulfilledFact"
            maxlength="100" /></label
        ><label
          >Факт нарушения<input v-model="o.brokenFact" maxlength="100" /></label
        ><label class="wide-field"
          >Перенос, условия и примечания<textarea
            v-model="o.notes"
            maxlength="1000"
            rows="2"
          />
        </label>
      </div>
      <button
        class="danger"
        @click="
          scenario.obligations = scenario.obligations.filter(
            (x) => x.id !== o.id,
          )
        "
      >
        Удалить обязательство
      </button>
    </article>
  </section>
  <details class="story-section fact-catalog">
    <summary>Факты и память · {{ scenario.facts.length }}</summary>
    <p class="hint">
      Факт мира и знание персонажа о нём различаются. Названия описывают смысл,
      ключи связывают проверку с игрой.
    </p>
    <div
      v-for="f in scenario.facts"
      :key="f.key"
      class="outcome-card story-field-grid"
    >
      <label
        >Название факта<input
          v-model="f.label"
          maxlength="250"
          @blur="f.label = f.label.trim() || 'Без названия'" /></label
      ><label>Ключ факта<input v-model="f.key" maxlength="100" /></label
      ><label class="wide-field"
        >Когда подтверждается / кто узнаёт<textarea
          v-model="f.description"
          maxlength="1000"
          rows="2"
        />
      </label>
    </div>
    <button :disabled="scenario.facts.length >= 100" @click="addFact">
      Добавить факт
    </button>
  </details>
  <details class="story-section preview-mechanics">
    <summary>Проверить последствия исхода · без изменения анкет</summary>
    <p class="hint">
      Отметьте факты, которые действительно наступили. Повторное подтверждение
      проверяет защиту от двойного начисления; чтение и прослушивание реплик
      ничего не начисляют.
    </p>
    <label
      >Исход для проверки<select v-model="outcomeId">
        <option value="">Выберите исход</option>
        <option v-for="o in scenario.outcomes" :key="o.id" :value="o.id">
          {{ o.label }}
        </option>
      </select></label
    >
    <div class="mechanic-checks">
      <label v-for="key in previewFacts" :key="key" class="mechanic-check"
        ><input
          type="checkbox"
          :checked="confirmedFacts.includes(key)"
          @change="toggleFact(key)"
        />{{ scenario.facts.find((f) => f.key === key)?.label || key }}</label
      >
    </div>
    <div class="designer-actions">
      <button :disabled="!outcomeId" @click="applyPreview">
        Подтвердить в проверке</button
      ><button @click="resetPreview">Сбросить проверку</button>
    </div>
    <p v-if="message" class="content-message" role="status">{{ message }}</p>
    <small
      >В журнале проверки: {{ ledger.length }} применённых последствий.</small
    >
  </details>
</template>
