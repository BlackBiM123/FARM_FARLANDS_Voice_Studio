import { voices } from "../shared/schema";
export type VoiceName = (typeof voices)[number];
export const voiceInfo: Record<
  VoiceName,
  { gender: "male" | "female"; character: string }
> = {
  Sadachbia: { gender: "male", character: "Живой, энергичный" },
  Algenib: { gender: "male", character: "Хрипловатый" },
  Alnilam: { gender: "male", character: "Твёрдый" },
  Gacrux: { gender: "female", character: "Зрелый" },
  Leda: { gender: "female", character: "Молодой" },
  Schedar: { gender: "male", character: "Ровный" },
  Fenrir: { gender: "male", character: "Возбуждённый" },
  Iapetus: { gender: "male", character: "Чистый, ясный" },
  Charon: { gender: "male", character: "Повествовательный" },
  Kore: { gender: "female", character: "Твёрдый" },
  Puck: { gender: "male", character: "Бодрый" },
  Aoede: { gender: "female", character: "Лёгкий, воздушный" },
  Zephyr: { gender: "female", character: "Яркий" },
  Orus: { gender: "male", character: "Твёрдый" },
};
export function genderLabel(voice: VoiceName) {
  return voiceInfo[voice].gender === "male"
    ? "Мужской · Male"
    : "Женский · Female";
}
export const emotionPresets = [
  { label: "Спокойствие", emotion: "Спокойно и размеренно, ровная интонация" },
  { label: "Радость", emotion: "Радостно, тепло и с улыбкой в голосе" },
  { label: "Восторг", emotion: "С искренним восторгом, оживлённо и энергично" },
  { label: "Нежность", emotion: "Нежно и заботливо, мягкая интонация" },
  { label: "Уверенность", emotion: "Уверенно и решительно, чёткие акценты" },
  {
    label: "Воодушевление",
    emotion: "Воодушевлённо и вдохновляюще, с нарастающей энергией",
  },
  {
    label: "Любопытство",
    emotion: "Любопытно и заинтересованно, вопросительные интонации",
  },
  {
    label: "Удивление",
    emotion: "С неожиданным удивлением, выразительные интонации",
  },
  { label: "Грусть", emotion: "Грустно и сдержанно, приглушённая интонация" },
  { label: "Скорбь", emotion: "С глубокой скорбью, тихо и тяжело" },
  {
    label: "Тревога",
    emotion: "Тревожно и настороженно, с напряжением в голосе",
  },
  { label: "Страх", emotion: "Испуганно, неуверенно и напряжённо" },
  { label: "Паника", emotion: "Панически, сбивчиво и взволнованно" },
  { label: "Злость", emotion: "Зло и раздражённо, резкие акценты" },
  {
    label: "Ярость",
    emotion: "В ярости, мощно и резко, с сильным напряжением",
  },
  { label: "Угроза", emotion: "Угрожающе и холодно, сдержанная агрессия" },
  {
    label: "Сарказм",
    emotion: "Саркастично, с насмешкой и ироничными акцентами",
  },
  {
    label: "Презрение",
    emotion: "Презрительно и высокомерно, холодная интонация",
  },
  {
    label: "Смущение",
    emotion: "Смущённо и застенчиво, нерешительная интонация",
  },
  { label: "Усталость", emotion: "Устало и без сил, приглушённая подача" },
  {
    label: "Таинственность",
    emotion: "Таинственно и интригующе, сдержанная выразительность",
  },
  {
    label: "Безразличие",
    emotion: "Безразлично и отстранённо, ровная сухая подача",
  },
  { label: "Шёпот", emotion: "Произносить шёпотом, тихо и отчётливо" },
  {
    label: "Боевой клич",
    emotion: "Боевой клич, громко и энергично, с решимостью",
  },
] as const;
