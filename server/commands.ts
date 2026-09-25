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
  templates,
  todayIn,
  type EventInput,
  type User,
} from "../shared/domain.js";

export const botCommands = [
  { name: "start", description: "Начать работу и помощь" },
  { name: "add", description: "Добавить: /add ДД.ММ.ГГГГ Название" },
  {
    name: "passport",
    description: "Паспорт: /passport дата_рождения 20 или 45",
  },
  {
    name: "health",
    description: "Обследование: /health дата интервал_в_месяцах",
  },
  { name: "next", description: "Ближайшие события и просроченные сроки" },
  { name: "show", description: "Рекомендации: /show код_события" },
  { name: "done", description: "Завершить: /done код_события" },
  { name: "settings", description: "Статус уведомлений" },
  { name: "time", description: "Время: /time 9 Asia/Novosibirsk" },
  { name: "privacy", description: "Скрывать детали: /privacy on или off" },
  { name: "pause", description: "Выключить напоминания" },
  { name: "resume", description: "Включить напоминания от бота" },
  { name: "test", description: "Проверить ответ бота с уведомлением" },
  { name: "help", description: "Список команд и примеры" },
];

const help = `Вовремя — важные сроки и следующие шаги прямо в MAX.

/add 01.12.2026 Оплатить налог — своё событие
/passport 20.10.2006 20 — замена паспорта по дате рождения (20 или 45 лет)
/health 24.09.2026 12 — следующая дата по интервалу врача в месяцах
/next — события, включая просроченные
/show код — дата, рекомендации и источник
/done код — отметить выполненным
/settings — статус уведомлений
/time 9 Asia/Novosibirsk — час и часовой пояс
/privacy on — скрыть детали в напоминаниях; off — показывать
/resume — включить напоминания
/pause — выключить напоминания
/test — проверить ответ бота

Код события указан в /next. Можно писать «события», «помощь», «настройки».
При создании напомним за 30, 7, 1 день и в день срока. Сначала включите отправку командой /resume и проверьте /settings.
События общие с мини-приложением. Фото и PDF распознаются через «Добавить документ» в календаре. Не присылайте номера документов в чат.`;

function parseDate(raw: string) {
  const match = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(raw);
  const date = match ? `${match[3]}-${match[2]}-${match[1]}` : raw;
  return isDate(date) ? date : null;
}

function status(user: User) {
  return `Напоминания ${user.settings.enabled ? "включены" : "выключены"}.\nВремя: ${String(user.settings.hour).padStart(2, "0")}:00, ${user.settings.timezone}.\nДетали в напоминаниях ${user.settings.privateMessages ? "скрыты" : "видны"}.\nСообщения приходят от этого бота, даже когда календарь закрыт.\n/resume — включить; /pause — выключить; /time — изменить время.`;
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
  if (command === "/start" || command === "/help") return help;
  if (command === "/pause" || command === "/resume") {
    saveSettings(db, user.id, {
      ...user.settings,
      enabled: command === "/resume",
    });
    return status(getUser(db, user.id)!);
  }
  if (command === "/settings") return status(user);
  if (command === "/test")
    return `Тестовое уведомление от бота Вовремя получено.\n${status(user)}\nЕсли нет звука или push, проверьте уведомления этого чата и разрешения MAX на устройстве.`;
  if (command === "/time") {
    const result = settingsSchema.safeParse({
      ...user.settings,
      hour: /^\d{1,2}$/.test(args[0] || "") ? Number(args[0]) : -1,
      timezone: args[1] || "",
    });
    if (args.length !== 2 || !result.success)
      return "Укажите час от 0 до 23 и часовой пояс. Например: /time 9 Asia/Novosibirsk или /time 9 Europe/Moscow.";
    saveSettings(db, user.id, result.data);
    return status(getUser(db, user.id)!);
  }
  if (command === "/privacy") {
    if (args.length !== 1 || !["on", "off"].includes(args[0]))
      return "/privacy on — скрыть названия в напоминаниях; /privacy off — показывать. Ответы на /next и /show всегда содержат запрошенные вами детали.";
    saveSettings(db, user.id, {
      ...user.settings,
      privateMessages: args[0] === "on",
    });
    return status(getUser(db, user.id)!);
  }
  if (["/add", "/passport", "/health"].includes(command)) {
    const date = parseDate(args[0] || "");
    const usage =
      command === "/add"
        ? "/add 01.12.2026 Оплатить налог"
        : command === "/passport"
          ? "/passport 20.10.2006 20 (возраст замены: 20 или 45)"
          : "/health 24.09.2026 12 (интервал врача: 1–120 месяцев)";
    if (!date)
      return `Нужна существующая дата ДД.ММ.ГГГГ или ГГГГ-ММ-ДД.\nПример: ${usage}`;
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
      return `Проверьте параметры (название — до 120 символов).\nПример: ${usage}`;
    if (listEvents(db, user.id).length >= 500)
      return "Можно хранить до 500 событий. Удалите ненужные в календаре.";
    const event = createEvent(db, user.id, parsed.data);
    return `Добавлено: ${event.title}\n${command === "/add" ? "Указанный" : "Рассчитанный"} срок: ${formatDate(event.dueDate)}.\n${command === "/health" ? "Расчёт по указанному вами интервалу; это не назначение обследования.\n" : ""}Рекомендации: /show ${event.id.slice(0, 8)}\nЗавершить: /done ${event.id.slice(0, 8)}\nНапомним за 30, 7, 1 день и в день срока.\n${status(user)}`;
  }
  if (command === "/next") {
    const events = listEvents(db, user.id).filter((event) => !event.completed);
    const offset = args.length === 0 ? 0 : Number(args[0]) - 1;
    if (args.length > 1 || !Number.isInteger(offset) || offset < 0)
      return "Список: /next; следующая страница: /next 2.";
    const page = events.slice(offset * 10, (offset + 1) * 10);
    if (!page.length)
      return events.length
        ? "На этой странице нет событий. Вернуться: /next."
        : "Пока нет событий. Создайте: /add 01.12.2026 Оплатить налог. Все команды: /help.";
    return (
      page
        .map(
          (event) =>
            `${formatDate(event.dueDate)} — ${event.title}${event.dueDate < todayIn(user.settings.timezone) ? " · срок прошёл" : ""}\n/show ${event.id.slice(0, 8)} · /done ${event.id.slice(0, 8)}`,
        )
        .join("\n\n") +
      (events.length > (offset + 1) * 10
        ? `\n\nДалее: /next ${offset + 2}`
        : "")
    );
  }
  if (command === "/show" || command === "/done") {
    if (args.length !== 1 || !/^[a-f0-9-]{8,36}$/i.test(args[0]))
      return `Укажите код из /next: ${command} код_события.`;
    const matches = listEvents(db, user.id).filter((event) =>
      event.id.startsWith(args[0].toLowerCase()),
    );
    if (matches.length !== 1)
      return "Событие не найдено или код неоднозначен. Проверьте /next; можно использовать полный ID из календаря.";
    const event = matches[0];
    if (command === "/done") {
      db.prepare("UPDATE events SET data=? WHERE id=? AND user_id=?").run(
        JSON.stringify({ ...event, completed: true }),
        event.id,
        user.id,
      );
      return `Готово: ${event.title}. Напоминания об этом событии больше не придут. Остальные события: /next.`;
    }
    const template = templates.find((item) => item.id === event.templateId)!;
    return `${event.title}\nСрок: ${formatDate(event.dueDate)}${event.completed ? " · выполнено" : ""}\n\nОснование расчёта: ${template.rule}\n\nЧто сделать:\n${template.steps.map((step, i) => `${i + 1}. ${step}`).join("\n")}\n${event.notes ? `\nВаша заметка: ${event.notes.slice(0, 1000)}\n` : ""}${"source" in template ? `\nИсточник: ${template.source}\n` : ""}${template.link ? `\nПерейти к услуге: ${template.link}` : ""}`;
  }
  return `Не удалось распознать команду. /help — примеры, /next — события.\nФото и PDF добавьте через «Добавить документ» в мини-приложении.`;
}
