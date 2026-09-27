import {
  createEvent,
  getUser,
  listEvents,
  saveSettings,
  type DB,
} from "./db.js";
import {
  eventInputSchema,
  formatDate,
  isDate,
  settingsSchema,
  todayIn,
  type EventInput,
  type User,
} from "../shared/domain.js";
import { chatCopy, eventDetails, statusText } from "./chat-content.js";

function parseDate(raw: string) {
  const match = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(raw);
  const date = match ? `${match[3]}-${match[2]}-${match[1]}` : raw;
  return isDate(date) ? date : null;
}

// Synchronous: the inbox worker wraps this function and its saved reply in one transaction.
export function commandReply(db: DB, user: User, raw: string) {
  const [word = "", ...args] = raw.trim().split(/\s+/);
  const aliases: Record<string, string> = {
    события: "/next",
    помощь: "/help",
    настройки: "/settings",
    старт: "/start",
  };
  const command = aliases[word.toLowerCase()] || word.toLowerCase();
  if (command === "/start" || command === "/help") return chatCopy.welcome;
  if (command === "/pause" || command === "/resume") {
    saveSettings(db, user.id, {
      ...user.settings,
      enabled: command === "/resume",
    });
    return statusText(getUser(db, user.id)!);
  }
  if (command === "/settings") return statusText(user);
  if (command === "/test")
    return `Тестовое уведомление от бота Вовремя получено.\n${statusText(user)}\nЕсли нет звука или push, проверьте уведомления этого чата и разрешения MAX на устройстве.`;
  if (command === "/time") {
    const result = settingsSchema.safeParse({
      ...user.settings,
      hour: /^\d{1,2}$/.test(args[0] || "") ? Number(args[0]) : -1,
      timezone: args[1] || "",
    });
    if (args.length !== 2 || !result.success)
      return "Выберите час и часовой пояс в настройках.";
    saveSettings(db, user.id, result.data);
    return statusText(getUser(db, user.id)!);
  }
  if (command === "/privacy") {
    if (args.length !== 1 || !["on", "off"].includes(args[0]))
      return "Выберите режим отображения деталей в настройках.";
    saveSettings(db, user.id, {
      ...user.settings,
      privateMessages: args[0] === "on",
    });
    return statusText(getUser(db, user.id)!);
  }
  if (["/add", "/passport", "/health"].includes(command)) {
    const date = parseDate(args[0] || "");
    if (!date)
      return "Нужна существующая дата ДД.ММ.ГГГГ. Добавьте событие через меню.";
    if (command !== "/add" && date > todayIn(user.settings.timezone))
      return "Дата рождения или прошедшего обследования не может быть в будущем.";
    const input: Partial<EventInput> =
      command === "/add"
        ? {
            templateId: "custom",
            title: args.slice(1).join(" "),
            category: "other",
          }
        : command === "/passport"
          ? {
              templateId: "passport",
              title: "Замена паспорта РФ",
              category: "documents",
              age: Number(args[1]) as 20 | 45,
            }
          : {
              templateId: "fluorography",
              title: "Флюорография",
              category: "health",
              intervalMonths: Number(args[1]),
            };
    const parsed = eventInputSchema.safeParse({ ...input, baseDate: date });
    if (!parsed.success || (command !== "/add" && args.length !== 2))
      return "Проверьте дату и название (до 120 символов). Добавьте событие через меню.";
    if (listEvents(db, user.id).length >= 500)
      return "Можно хранить до 500 событий. Удалите ненужные в календаре.";
    const event = createEvent(db, user.id, parsed.data);
    return `Добавлено: ${event.title}\n${command === "/add" ? "Указанный" : "Рассчитанный"} срок: ${formatDate(event.dueDate)}.\n${command === "/health" ? "Расчёт по указанному вами интервалу; это не назначение обследования.\n" : ""}Откройте «Мои события», чтобы увидеть рекомендации или отметить выполнение.\nНапомним за 30, 7, 1 день и в день срока.\n${statusText(user)}`;
  }
  if (command === "/next") {
    const events = listEvents(db, user.id).filter((event) => !event.completed);
    const offset = args.length === 0 ? 0 : Number(args[0]) - 1;
    if (args.length > 1 || !Number.isInteger(offset) || offset < 0)
      return "Откройте список событий кнопкой «Мои события».";
    const page = events.slice(offset * 10, (offset + 1) * 10);
    if (!page.length)
      return events.length
        ? "На этой странице нет событий. Откройте «Мои события»."
        : "Пока нет событий. Добавьте первое через меню чата.";
    return (
      page
        .map(
          (event) =>
            `${formatDate(event.dueDate)} — ${event.title}${event.dueDate < todayIn(user.settings.timezone) ? " · срок прошёл" : ""}`,
        )
        .join("\n\n") +
      (events.length > (offset + 1) * 10
        ? "\n\nДругие события доступны через кнопку «Мои события»."
        : "")
    );
  }
  if (command === "/show" || command === "/done") {
    if (args.length !== 1 || !/^[a-f0-9-]{8,36}$/i.test(args[0]))
      return "Выберите событие кнопкой «Мои события».";
    const matches = listEvents(db, user.id).filter((event) =>
      event.id.startsWith(args[0].toLowerCase()),
    );
    if (matches.length !== 1)
      return "Событие не найдено. Откройте «Мои события» и выберите его снова.";
    const event = matches[0];
    if (command === "/done") {
      db.prepare("UPDATE events SET data=? WHERE id=? AND user_id=?").run(
        JSON.stringify({ ...event, completed: true }),
        event.id,
        user.id,
      );
      return `Готово: ${event.title}. Напоминания об этом событии больше не придут. Остальные события доступны через меню.`;
    }
    return eventDetails(event);
  }
  return chatCopy.unknown;
}
