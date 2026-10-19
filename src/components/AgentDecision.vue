<script setup lang="ts">
import { computed } from "vue";
import type { WorldAgent, WorldEvent } from "../../shared/world";
import { formatWorldTime } from "../world-runs";
const props = defineProps<{
  actor: WorldAgent;
  decision?: WorldEvent;
  minute: number;
  placeName: (id: string) => string;
}>();
const labels: Record<string, string> = {
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
  meet: "Поиск собеседника",
  social: "Разговор",
  mechanic: "Действие модуля",
};
const chosen = computed(
  () => props.decision?.text.match(/^Выбрано: (.*?) · /)?.[1],
);
const unavailable = computed(() =>
  props.actor.choices.filter((c) => c.score < 0),
);
const alternatives = computed(() =>
  props.actor.choices
    .filter((c) => c.score >= 0 && c.action !== chosen.value)
    .slice()
    .sort((a, b) => b.score - a.score),
);
const next = computed(() => {
  const a = props.actor.action;
  if (a.type === "travel")
    return `После прибытия: ${labels[a.after?.type] ?? "следующий этап плана"}. Затем — новый выбор после завершения действия.`;
  if (a.remaining)
    return `После завершения текущего действия (осталось ${a.remaining} мин) NPC снова сравнит доступные варианты.`;
  return "При следующем шаге симуляции NPC сравнит доступные варианты.";
});
</script>
<template>
  <section class="agent-decision" aria-label="Объяснение решения NPC">
    <h4>Как он принимает решение</h4>
    <dl>
      <div>
        <dt>Долгосрочная цель</dt>
        <dd>{{ actor.goal }}</dd>
      </div>
      <div>
        <dt>Сейчас</dt>
        <dd>
          {{ labels[actor.action.type] ?? "Выбор действия"
          }}<template v-if="actor.action.type === 'travel'">
            → {{ placeName(actor.action.to) }}</template
          ><span
            >Сытость {{ Math.round(actor.hunger / 10) }}% · энергия
            {{ Math.round(actor.energy / 10) }}%</span
          >
        </dd>
      </div>
      <div>
        <dt>Последний выбор</dt>
        <dd>
          {{ chosen ?? "Первое решение ещё не принято"
          }}<span v-if="decision"
            >{{ formatWorldTime(decision.minute) }} ·
            {{ minute - decision.minute }} мин назад</span
          >
        </dd>
      </div>
      <div>
        <dt>Причина текущего действия</dt>
        <dd>{{ actor.reason }}</dd>
      </div>
      <div>
        <dt>Что дальше</dt>
        <dd>{{ next }}</dd>
      </div>
    </dl>
    <p class="decision-note">
      Ниже — оценки на момент последнего выбора. Это не непрерывный прогноз:
      запасы и потребности могли измениться за время действия. Большее число
      означает больший приоритет; при равенстве действует порядок правил.
    </p>
    <details v-if="alternatives.length">
      <summary>Другие доступные варианты · {{ alternatives.length }}</summary>
      <ul>
        <li v-for="c in alternatives" :key="c.action">
          <strong>{{ c.action }} · {{ c.score }}</strong>
          <p>{{ c.reason }}</p>
        </li>
      </ul>
    </details>
    <details v-if="unavailable.length">
      <summary>Что было недоступно · {{ unavailable.length }}</summary>
      <ul>
        <li v-for="c in unavailable" :key="c.action">
          <strong>{{ c.action }}</strong>
          <p
            v-if="
              c.action === 'Поесть' ||
              c.action === 'Отдых' ||
              c.action.startsWith('Модуль')
            "
          >
            {{ c.reason }}
          </p>
          <p v-else>
            Не выполнены условия этого действия. {{ c.reason }} — описание
            правила, а не подтверждение его выполнения.
          </p>
        </li>
      </ul>
    </details>
  </section>
</template>
<style scoped>
.agent-decision {
  margin: 16px 0;
  padding: 16px;
  border: 1px solid #b99a5638;
  border-radius: 10px;
  background: #e4ba6310;
}
.agent-decision h4 {
  margin: 0 0 14px;
  color: #edc77e;
  font-size: 0.95rem;
}
.agent-decision dl {
  margin: 0;
  display: grid;
  gap: 13px;
}
.agent-decision dt {
  font-size: 0.73rem;
  color: #aaa39a;
  margin-bottom: 4px;
}
.agent-decision dd {
  margin: 0;
  font-size: 0.86rem;
  line-height: 1.55;
  overflow-wrap: anywhere;
}
.agent-decision dd span {
  display: block;
  color: #a9a39a;
  font-size: 0.75rem;
  margin-top: 4px;
}
.decision-note {
  font-size: 0.75rem;
  line-height: 1.6;
  color: #aaa39a;
  margin: 16px 0;
}
.agent-decision details {
  border-top: 1px solid #ffffff14;
  padding: 12px 0 0;
  margin-top: 12px;
}
.agent-decision summary {
  cursor: pointer;
  font-size: 0.8rem;
}
.agent-decision ul {
  padding-left: 17px;
  margin: 12px 0 0;
}
.agent-decision li {
  font-size: 0.8rem;
  margin-bottom: 12px;
  line-height: 1.5;
}
.agent-decision li p {
  margin: 4px 0;
  color: #bcb7b0;
}
</style>
