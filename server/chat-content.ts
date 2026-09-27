import {
  formatDate,
  nextSteps,
  templateById,
  type Deadline,
  type User,
} from "../shared/domain.js";

// User-facing bot copy lives here; service-specific advice lives in shared/services.ts.
export const chatCopy = {
  welcome:
    "Добро пожаловать во «Вовремя». Выберите действие в меню чата или откройте мини-приложение через кнопку MAX.",
  help: "Выберите сферу и услугу кнопками, затем отправьте дату. События общие с мини-приложением. В настройках можно включить напоминания и выбрать время. Документы добавляются в мини-приложении.",
  unknown:
    "Я помогу следить за важными сроками. Выберите действие в меню чата или откройте мини-приложение через кнопку MAX.",
  privateReminder:
    "Следующие действия: откройте «Рекомендации», проверьте нужные документы и способ обращения. После выполнения отметьте событие завершённым.\nДетали скрыты вашей настройкой приватности.",
} as const;

export function statusText(user: User) {
  return `Напоминания ${user.settings.enabled ? "включены" : "выключены"}.\nВремя: ${String(user.settings.hour).padStart(2, "0")}:00, ${user.settings.timezone}.\nДетали в напоминаниях ${user.settings.privateMessages ? "скрыты" : "видны"}.\nСообщения приходят от этого бота, даже когда календарь закрыт.`;
}

export function eventDetails(event: Deadline) {
  const template = templateById[event.templateId];
  return `${event.title}\nСрок: ${formatDate(event.dueDate)}${event.completed ? " · выполнено" : ""}\n\nОснование расчёта: ${template.rule}\n\nЧто сделать:\n${nextSteps(
    { ...event, notes: event.notes.slice(0, 1000) },
  )
    .map((step, i) => `${i + 1}. ${step}`)
    .join(
      "\n",
    )}${"scope" in template ? `\n\nУсловия: ${template.scope}` : ""}${"source" in template ? `\nИсточник: ${template.source}\n` : ""}${template.link ? `\nПерейти к услуге: ${template.link}` : ""}`;
}
