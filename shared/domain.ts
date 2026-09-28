import { z } from "zod";
import {
  categories,
  templates,
  templateById,
  chatCopy,
  resolveTemplateId,
  sortTemplatesForDisplay,
  type Category,
  type TemplateId,
} from "./content.js";
export {
  categories,
  templates,
  templateById,
  resolveTemplateId,
  sortTemplatesForDisplay,
  type Category,
  type TemplateId,
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
export function nextSteps(event: Pick<EventInput, "templateId" | "notes">) {
  const template = templateById[event.templateId];
  return [
    ...template.steps,
    ...(event.notes ? [`${chatCopy.labels.note}${event.notes}`] : []),
  ];
}
export const eventInputSchema = z
  .object({
    templateId: z
      .string()
      .refine((id) => !!resolveTemplateId(id), "Услуга не найдена")
      .transform((id) => resolveTemplateId(id)!),
    title: z.string().trim().min(1).max(120),
    category: z.enum(Object.keys(categories) as [Category, ...Category[]]),
    baseDate: dateSchema,
    age: z.union([z.literal(20), z.literal(45)]).optional(),
    intervalMonths: z.number().int().min(1).max(120).optional(),
    reminders: z
      .array(z.number().int().min(0).max(365))
      .max(8)
      .default([30, 7, 1, 0]),
    notes: z.string().max(2000).default(""),
    documentName: z.string().max(160).default(""),
  })
  .transform((input) => ({
    ...input,
    category:
      input.templateId === "custom"
        ? input.category
        : templateById[input.templateId].category,
  }));
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
  const calculation = templateById[input.templateId].calculation;
  if (calculation === "passport") {
    if (!input.age) throw new Error("Выберите замену в 20 или 45 лет");
    const milestoneDate = addMonths(input.baseDate, input.age * 12);
    return { milestoneDate, dueDate: addDays(milestoneDate, 90) };
  }
  if (calculation === "interval") {
    if (!input.intervalMonths)
      throw new Error("Укажите интервал, рекомендованный врачом");
    return { dueDate: addMonths(input.baseDate, input.intervalMonths) };
  }
  return { dueDate: input.baseDate };
}
export const settingsSchema = z.object({
  enabled: z.boolean(),
  hour: z.number().int().min(0).max(23),
  minute: z.number().int().min(0).max(59).default(0),
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
  minute: 0,
  timezone: "Europe/Moscow",
  privateMessages: true,
};
export function formatReminderTime(
  settings: Pick<Settings, "hour" | "minute">,
) {
  return `${String(settings.hour).padStart(2, "0")}:${String(settings.minute).padStart(2, "0")}`;
}
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
