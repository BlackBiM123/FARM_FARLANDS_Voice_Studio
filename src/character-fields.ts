import type { CharacterProfile } from "../shared/character";
export type CharacterField = {
  key: keyof CharacterProfile;
  label: string;
  kind?: "text" | "area" | "number" | "select";
  options?: [string, string][];
  hint?: string;
};
export const characterSections: {
  id: string;
  title: string;
  description: string;
  fields: CharacterField[];
}[] = [
  {
    id: "identity",
    title: "Личность",
    description: "Кто этот человек и где его место в регионе.",
    fields: [
      {
        key: "gender",
        label: "Пол",
        kind: "select",
        options: [
          ["unspecified", "Не указан"],
          ["male", "Мужской"],
          ["female", "Женский"],
          ["other", "Другой"],
        ],
      },
      { key: "age", label: "Возраст, лет", kind: "number" },
      {
        key: "lifeStage",
        label: "Этап жизни",
        kind: "select",
        options: [
          ["unspecified", "Не указан"],
          ["child", "Ребёнок"],
          ["teen", "Подросток"],
          ["adult", "Взрослый"],
          ["mature", "Зрелый"],
          ["elder", "Пожилой"],
        ],
      },
      { key: "species", label: "Вид / происхождение" },
      { key: "culture", label: "Культура / народ" },
      { key: "region", label: "Регион" },
      { key: "settlement", label: "Поселение" },
      { key: "home", label: "Дом / место жительства" },
      {
        key: "appearance",
        label: "Внешность и отличительные признаки",
        kind: "area",
      },
    ],
  },
  {
    id: "personality",
    title: "Характер",
    description: "Биография, привычки и внутренние ориентиры персонажа.",
    fields: [
      { key: "biography", label: "Биография", kind: "area" },
      { key: "background", label: "Детство и прошлое", kind: "area" },
      { key: "personality", label: "Характер и темперамент", kind: "area" },
      { key: "traits", label: "Ключевые черты характера" },
      { key: "values", label: "Ценности и убеждения", kind: "area" },
      { key: "fears", label: "Страхи и уязвимости", kind: "area" },
      { key: "likes", label: "Что любит", kind: "area" },
      { key: "dislikes", label: "Что не любит", kind: "area" },
      {
        key: "habits",
        label: "Привычки и особенности поведения",
        kind: "area",
      },
    ],
  },
  {
    id: "world",
    title: "Роль в мире",
    description: "Профессия, экономика, услуги и участие в механиках игры.",
    fields: [
      { key: "profession", label: "Профессия / специализация" },
      { key: "workplace", label: "Место работы" },
      { key: "services", label: "Услуги для игрока и поселения", kind: "area" },
      { key: "products", label: "Товары, ресурсы и потребности", kind: "area" },
      {
        key: "skills",
        label: "Навыки и профессиональные умения",
        kind: "area",
      },
      { key: "income", label: "Доход за игровой день", kind: "number" },
      {
        key: "wealth",
        label: "Достаток",
        kind: "select",
        options: [
          ["unspecified", "Не указан"],
          ["poor", "Бедный"],
          ["modest", "Скромный"],
          ["comfortable", "Обеспеченный"],
          ["wealthy", "Богатый"],
        ],
      },
      { key: "faction", label: "Фракция / организация" },
      { key: "reputation", label: "Репутация в поселении", kind: "area" },
      { key: "socialRole", label: "Социальная роль и влияние", kind: "area" },
    ],
  },
  {
    id: "family",
    title: "Семья и связи",
    description: "Семейное древо, дружба, романтика и конфликты между людьми.",
    fields: [
      { key: "household", label: "Семья / домохозяйство" },
      {
        key: "maritalStatus",
        label: "Семейное положение",
        kind: "select",
        options: [
          ["unspecified", "Не указано"],
          ["single", "Без партнёра"],
          ["partnered", "В отношениях"],
          ["married", "В браке"],
          ["widowed", "Вдовство"],
          ["divorced", "Развод"],
        ],
      },
      { key: "familyHistory", label: "История семьи", kind: "area" },
      {
        key: "romanceNotes",
        label: "Романтическая линия и её условия",
        kind: "area",
      },
      { key: "childrenNotes", label: "Дети и планы семьи", kind: "area" },
    ],
  },
  {
    id: "fate",
    title: "Истории и судьба",
    description:
      "Уютный мир с серьёзными историями, редкими утратами и разными жизненными путями.",
    fields: [
      {
        key: "lifeStatus",
        label: "Текущее состояние",
        kind: "select",
        options: [
          ["alive", "Живёт в регионе"],
          ["missing", "Пропал / отсутствует"],
          ["deceased", "Умер в ходе истории"],
          ["other", "Другое"],
        ],
      },
      {
        key: "aging",
        label: "Правило старения",
        kind: "select",
        options: [
          ["none", "Не стареет"],
          ["elderly_only", "Мягкие изменения только в пожилом возрасте"],
          ["custom", "Индивидуальное правило"],
        ],
      },
      {
        key: "mortality",
        label: "Правило смертности",
        kind: "select",
        options: [
          ["rare_events", "Только редкие сюжетные события"],
          ["none", "Без смерти персонажа"],
          ["custom", "Индивидуальное правило"],
        ],
      },
      { key: "health", label: "Здоровье и ограничения", kind: "area" },
      { key: "shortGoal", label: "Ближайшая цель", kind: "area" },
      {
        key: "longGoal",
        label: "Главная мечта / долгосрочная цель",
        kind: "area",
      },
      { key: "secret", label: "Тайна персонажа", kind: "area" },
      { key: "internalConflict", label: "Внутренний конфликт", kind: "area" },
      {
        key: "externalConflict",
        label: "Конфликт с другими / обществом",
        kind: "area",
      },
      { key: "storyArc", label: "Текущая сюжетная арка", kind: "area" },
      { key: "fateEvents", label: "События, меняющие судьбу", kind: "area" },
      {
        key: "deathConditions",
        label: "Условия редкой сюжетной смерти",
        kind: "area",
      },
      {
        key: "futurePaths",
        label: "Возможные жизненные траектории",
        kind: "area",
      },
      {
        key: "quests",
        label: "Связанные квесты и условия их появления",
        kind: "area",
      },
    ],
  },
  {
    id: "voice",
    title: "Голос",
    description: "Голос, эмоция и режиссёрские указания для озвучки.",
    fields: [],
  },
  {
    id: "extra",
    title: "Характеристики",
    description:
      "Базовые параметры и дополнительные поля под ваши игровые механики.",
    fields: [],
  },
];
export const attributeLabels = {
  strength: "Сила",
  stamina: "Выносливость",
  agility: "Ловкость",
  intelligence: "Интеллект",
  charisma: "Харизма",
  willpower: "Сила воли",
  empathy: "Эмпатия",
  ambition: "Амбициозность",
  sociability: "Общительность",
  caution: "Осторожность",
};
export const relationshipLabels = {
  mother: "Мать",
  father: "Отец",
  parent: "Родитель",
  child: "Ребёнок",
  sibling: "Брат / сестра",
  grandparent: "Дедушка / бабушка",
  spouse: "Супруг / супруга",
  partner: "Партнёр",
  romantic_interest: "Романтический интерес",
  friend: "Друг",
  rival: "Соперник",
  enemy: "Враг",
  mentor: "Наставник",
  apprentice: "Ученик",
  colleague: "Коллега",
  other: "Другая связь",
};
export const mechanicLabels = {
  farming: "Фермерство",
  trading: "Торговля",
  crafting: "Ремесло",
  fishing: "Рыбалка",
  hunting: "Охота",
  medicine: "Лечение",
  quests: "Квесты",
  relationships: "Отношения",
  services: "Услуги",
  exploration: "Исследование",
  community: "Жизнь поселения",
};
