<script setup lang="ts">
import { computed, ref } from "vue";
import type { WorldDefinition, WorldState } from "../../shared/world";
import { prepareFoodChain, foodDiagnostics } from "../food-chain";
const model = defineModel<WorldDefinition>({ required: true });
const props = defineProps<{ state?: WorldState; readonly?: boolean }>();
const error = ref("");
const stats = computed(() =>
  props.state ? foodDiagnostics(model.value, props.state) : undefined,
);
const title = (id: string) =>
  model.value.items.find((i) => i.id === id)?.name ?? id;
function prepare() {
  try {
    model.value = prepareFoodChain(model.value);
    error.value = "";
  } catch (e) {
    error.value = String(e);
  }
}
</script>
<template>
  <details class="panel food-chain" :open="!readonly">
    <summary>
      Питание и кухня
      <span>{{
        model.cooking?.enabled
          ? "Производственная цепочка"
          : "Начальный запас картофеля"
      }}</span>
    </summary>
    <p class="hint">
      Сырьё фермы → переработка → оплаченная доставка в таверну → приготовление
      → покупка и питание жителей. Каждый этап расходует реальные товары и
      время; деньги переходят между счетами.
    </p>
    <template v-if="!readonly">
      <button v-if="!model.cooking" @click="prepare">
        Подготовить цепочку приготовления еды
      </button>
      <template v-else>
        <label class="food-toggle"
          ><input v-model="model.cooking.enabled" type="checkbox" />Готовить
          блюда из доставленного сырья</label
        >
        <div class="food-fields">
          <label
            >Сырьё кухни<select v-model="model.cooking.input">
              <option :value="model.production.output">
                {{ title(model.production.output) }}
              </option>
            </select></label
          >
          <label
            >Готовое блюдо<select v-model="model.cooking.output">
              <option
                v-for="item in model.items.filter(
                  (i) => i.id !== model.cooking?.input,
                )"
                :key="item.id"
                :value="item.id"
              >
                {{ item.name }}
              </option>
            </select></label
          >
          <label
            >Расход сырья на партию<input
              v-model.number="model.cooking.inputAmount"
              type="number"
              min="1"
              max="100"
          /></label>
          <label
            >Порций в партии<input
              v-model.number="model.cooking.outputAmount"
              type="number"
              min="1"
              max="100"
          /></label>
          <label
            >Минут труда на партию<input
              v-model.number="model.cooking.minutes"
              type="number"
              min="10"
              max="1440"
          /></label>
        </div>
        <p class="hint">
          Кухня работает в таверне за счёт труда NPC с ролью «Трактирщик».
          Перевозчик забирает доступный груз по спросу и грузоподъёмности;
          автоматического появления ингредиентов нет. Цена блюда — во вкладке
          «Товары».
        </p>
      </template>
      <p class="hint">
        Подготовка создаёт товар блюда и пустой склад. Запасы, кошельки,
        персонажи и география сохраняются. Сохраните мир и создайте новый
        запуск. Изменение результата производства требует согласовать сырьё
        кухни.
      </p>
      <p v-if="error" role="alert">{{ error }}</p>
    </template>
    <template v-if="stats">
      <div class="food-stats">
        <div>
          <strong>{{ stats.ready }}</strong
          ><span>Порций в продаже</span>
        </div>
        <div>
          <strong>{{ stats.hungry }}</strong
          ><span>NPC хотят есть</span>
        </div>
        <div>
          <strong>{{ stats.cannotAfford }}</strong
          ><span>Не могут оплатить порцию</span>
        </div>
        <div>
          <strong>{{ stats.portionsPerDay }}</strong
          ><span>Порций/сутки · оценка по правилам</span>
        </div>
      </div>
      <p>
        Питание: {{ title(stats.item) }}. Произведено за запуск:
        {{ stats.produced }}; съедено: {{ stats.eaten }}.
      </p>
      <template v-if="model.cooking?.enabled">
        <p>
          На кухне: {{ stats.ingredients }} {{ title(model.cooking.input) }}.
          Труд в текущей партии: {{ state?.cookingMinutes ?? 0 }} /
          {{ model.cooking.minutes }} мин.
        </p>
        <p v-if="!stats.cooks" class="food-warning">
          Нет трактирщика с рабочим местом в таверне — блюда не появятся.
        </p>
        <p v-if="!stats.couriers" class="food-warning">
          Нет перевозчика — сырьё с фермы не доедет до кухни.
        </p>
        <p
          v-if="stats.ingredients < model.cooking.inputAmount"
          class="food-warning"
        >
          Кухне не хватает сырья. Проверьте производство, склад фермы, маршрут и
          деньги таверны.
        </p>
      </template>
      <p v-if="!stats.ready" class="food-warning">
        Продажа еды остановлена: нет готовых порций.
      </p>
      <p v-if="stats.cannotAfford" class="food-warning">
        Доходы части жителей не покрывают еду. Приготовление не решает
        отсутствие профессий и семейных бюджетов.
      </p>
      <p class="hint">
        Это диагностика текущего запуска. Оценка спроса округлена вверх и не
        является прогнозом выживания. Исходное зерно и внешние запасы конечны;
        выращивание нового урожая пока не моделируется.
      </p>
    </template>
  </details>
</template>
<style scoped>
.food-chain {
  padding: 18px;
  margin-bottom: 18px;
}
.food-chain summary {
  font-weight: 700;
  cursor: pointer;
}
.food-chain summary span {
  font-weight: 400;
  font-size: 0.8em;
  color: #999;
  margin-left: 12px;
}
.food-chain p {
  margin: 12px 0;
  line-height: 1.5;
}
.food-fields {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
  gap: 14px;
  margin: 16px 0;
}
.food-fields label {
  display: grid;
  gap: 7px;
  font-size: 0.85rem;
}
.food-fields input,
.food-fields select {
  min-width: 0;
  width: 100%;
  padding: 9px;
  box-sizing: border-box;
}
.food-toggle {
  display: flex;
  gap: 10px;
  align-items: center;
  margin: 16px 0;
}
.food-toggle input {
  width: auto;
}
.food-stats {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(130px, 1fr));
  gap: 12px;
  margin-top: 16px;
}
.food-stats div {
  padding: 12px;
  background: #ffffff05;
  border: 1px solid #ffffff12;
  border-radius: 8px;
}
.food-stats strong {
  display: block;
  font-size: 1.4rem;
  margin-bottom: 6px;
}
.food-stats span {
  color: #aaa;
  font-size: 0.8rem;
}
.food-warning {
  border-left: 3px solid #d5a44c;
  padding-left: 12px;
  color: #e6bf7c;
}
@media (max-width: 600px) {
  .food-chain {
    padding: 12px;
  }
  .food-fields {
    grid-template-columns: 1fr 1fr;
    gap: 10px;
  }
  .food-fields label {
    font-size: 0.75rem;
  }
}
</style>
