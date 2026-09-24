import { z } from "zod";
export type Category = "documents" | "health" | "payments" | "other";
export const categories: Record<Category, string> = {
  documents: "Документы",
  health: "Здоровье",
  payments: "Платежи",
  other: "Личное",
};
export function isDate(value: string) {
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    !Number.isNaN(Date.parse(value)) &&
    new Date(value).toISOString().slice(0, 10) === value &&
    value >= "1900-01-01" &&
    value <= "2200-12-31"
  );
}
export const dateSchema = z.string().refine(isDate, "Укажите корректную дату");
export function addDays(date: string, days: number) {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
export function addMonths(date: string, months: number) {
  const d = new Date(`${date}T12:00:00Z`);
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + months);
  const last = new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0),
  ).getUTCDate();
  d.setUTCDate(Math.min(day, last));
  return d.toISOString().slice(0, 10);
}
export function todayIn(zone = "Europe/Moscow", now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: zone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}
export function dayDiff(a: string, b: string) {
  return Math.round((Date.parse(a) - Date.parse(b)) / 86400000);
}
export function formatDate(date: string, short = false) {
  return new Date(date + "T12:00:00").toLocaleDateString("ru-RU", {
    day: "numeric",
    month: short ? "short" : "long",
    ...(short ? {} : { year: "numeric" }),
  });
}
export const templates = [
  {
    id: "passport",
    title: "Замена паспорта РФ",
    category: "documents",
    description: "В 20 и 45 лет · расчёт по дате рождения",
    dateLabel: "Дата рождения",
    source:
      "https://www.consultant.ru/document/cons_doc_LAW_466454/6125ca6a5baabbd3bbff7302f2c6e114b94061fa/",
    rule: "20-й или 45-й день рождения + 90 календарных дней. Выберите нужную замену, включая уже просроченную.",
    steps: [
      "После дня рождения подайте заявление на замену паспорта через Госуслуги или уточните порядок в МВД / МФЦ.",
      "Подготовьте паспорт и фотографии; актуальный список документов и пошлину проверьте перед обращением.",
      "После получения нового паспорта отметьте событие выполненным.",
    ],
    link: "https://www.gosuslugi.ru/",
  },
  {
    id: "fluorography",
    title: "Флюорография",
    category: "health",
    description: "Следующее обследование по вашему интервалу",
    dateLabel: "Дата последнего обследования",
    source: "https://39.rospotrebnadzor.ru/node/19583",
    rule: "Дата обследования + интервал, рекомендованный врачом. Единого «срока годности» для всех нет: периодичность зависит от возраста, региона и группы риска.",
    steps: [
      "Уточните у врача, когда вам показано следующее обследование.",
      "Запишитесь в поликлинику, если врач рекомендует обследование.",
      "После обследования добавьте новую дату и согласованный с врачом интервал.",
    ],
    link: "https://www.gosuslugi.ru/",
  },
  {
    id: "tax",
    title: "Имущественные налоги",
    category: "payments",
    description: "Транспорт, недвижимость и земля",
    dateLabel: "Дата из налогового уведомления",
    source: "https://www.nalog.gov.ru/nu/",
    rule: "Для уведомлений за 2025 год общий срок — 1 декабря 2026 года. Льготы и продления могут менять срок: дата из вашего уведомления приоритетна.",
    steps: [
      "Проверьте начисления, льготы и срок в личном кабинете ФНС.",
      "Оплатите по реквизитам налогового уведомления.",
      "Убедитесь, что платёж учтён, и отметьте событие выполненным.",
    ],
    link: "https://lkfl2.nalog.ru/lkfl/",
  },
  {
    id: "international",
    title: "Загранпаспорт",
    category: "documents",
    description: "Срок действия из вашего документа",
    dateLabel: "Действителен до",
    rule: "Используем дату окончания из документа. Требования к оставшемуся сроку для поездки уточняйте у страны въезда.",
    steps: [
      "Проверьте срок действия в документе.",
      "Если планируете поездку, проверьте требования страны въезда.",
      "Заранее подайте заявление на новый паспорт.",
    ],
    link: "https://www.gosuslugi.ru/",
  },
  {
    id: "insurance",
    title: "Полис ОСАГО",
    category: "documents",
    description: "Напомним продлить полис",
    dateLabel: "Дата окончания полиса",
    rule: "Дата окончания берётся из действующего полиса.",
    steps: [
      "Проверьте период страхования в полисе.",
      "Оформите новый полис до окончания действующего.",
    ],
    link: "",
  },
  {
    id: "custom",
    title: "Своё событие",
    category: "other",
    description: "Любая важная дата и свои рекомендации",
    dateLabel: "Крайний срок",
    rule: "Срок и рекомендации задаются вами.",
    steps: ["Проверьте условия и необходимые документы у поставщика услуги."],
    link: "",
  },
] as const;
export type TemplateId = (typeof templates)[number]["id"];
export const eventInputSchema = z.object({
  templateId: z.enum([
    "passport",
    "fluorography",
    "tax",
    "international",
    "insurance",
    "custom",
  ]),
  title: z.string().trim().min(1).max(120),
  category: z.enum(["documents", "health", "payments", "other"]),
  baseDate: dateSchema,
  age: z.union([z.literal(20), z.literal(45)]).optional(),
  intervalMonths: z.number().int().min(1).max(120).optional(),
  reminders: z
    .array(z.number().int().min(0).max(365))
    .max(8)
    .default([30, 7, 1, 0]),
  notes: z.string().max(2000).default(""),
  documentName: z.string().max(160).default(""),
});
export type EventInput = z.infer<typeof eventInputSchema>;
export type Deadline = EventInput & {
  id: string;
  dueDate: string;
  milestoneDate?: string;
  completed: boolean;
  createdAt: string;
};
export function calculateDeadline(input: EventInput): {
  dueDate: string;
  milestoneDate?: string;
} {
  if (input.templateId === "passport") {
    if (!input.age) throw new Error("Выберите замену в 20 или 45 лет");
    const milestoneDate = addMonths(input.baseDate, input.age * 12);
    return { milestoneDate, dueDate: addDays(milestoneDate, 90) };
  }
  if (input.templateId === "fluorography") {
    if (!input.intervalMonths)
      throw new Error("Укажите интервал, рекомендованный врачом");
    return { dueDate: addMonths(input.baseDate, input.intervalMonths) };
  }
  return { dueDate: input.baseDate };
}
export const settingsSchema = z.object({
  enabled: z.boolean(),
  hour: z.number().int().min(0).max(23),
  timezone: z.string().refine((v) => {
    try {
      new Intl.DateTimeFormat("ru", { timeZone: v });
      return true;
    } catch {
      return false;
    }
  }, "Неизвестный часовой пояс"),
  privateMessages: z.boolean(),
});
export type Settings = z.infer<typeof settingsSchema>;
export const defaultSettings: Settings = {
  enabled: false,
  hour: 9,
  timezone: "Europe/Moscow",
  privateMessages: true,
};
export type User = {
  id: string;
  name: string;
  settings: Settings;
  botStarted: boolean;
  demo: boolean;
};
export type Delivery = {
  id: string;
  eventId: string;
  title: string;
  sentAt: string;
  status: string;
};
export function extractDates(text: string) {
  const results: { date: string; context: string }[] = [];
  for (const m of text.matchAll(
    /\b(\d{2})[.\/-](\d{2})[.\/-](\d{4})\b|\b(\d{4})-(\d{2})-(\d{2})\b/g,
  )) {
    const date = m[4] ? `${m[4]}-${m[5]}-${m[6]}` : `${m[3]}-${m[2]}-${m[1]}`;
    if (isDate(date) && !results.some((v) => v.date === date))
      results.push({
        date,
        context: text
          .slice(Math.max(0, m.index! - 45), m.index! + m[0].length + 45)
          .replace(/\s+/g, " ")
          .trim(),
      });
  }
  return results;
}
