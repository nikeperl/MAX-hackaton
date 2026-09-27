import { randomUUID } from "node:crypto";
import {
  categories,
  templates,
  templateById,
  eventInputSchema,
  calculateDeadline,
  formatDate,
  isDate,
  todayIn,
  type Category,
  type TemplateId,
  type User,
} from "../shared/domain.js";
import {
  createEvent,
  getUser,
  listEvents,
  saveSettings,
  type DB,
} from "./db.js";
import { commandReply } from "./commands.js";

export type BotButton =
  | { type: "callback"; text: string; payload: string }
  | { type: "link"; text: string; url: string };
export type Keyboard = BotButton[][];
export type ChatReply = { text: string; buttons: Keyboard };
const button = (text: string, payload: string): BotButton => ({
  type: "callback",
  text,
  payload,
});
export const menuButtons: Keyboard = [
  [button("Добавить событие", "catalog"), button("Мои события", "events:0")],
  [button("Настройки", "settings"), button("Помощь", "help")],
];
const back: Keyboard = [[button("Главное меню", "menu")]];
const cancel: Keyboard = [[button("Отменить", "menu")]];
const reply = (text: string, buttons: Keyboard = menuButtons): ChatReply => ({
  text,
  buttons,
});
type Draft = {
  nonce: string;
  templateId: TemplateId;
  stage: "title" | "date" | "age" | "interval" | "confirm";
  title: string;
  baseDate?: string;
  age?: 20 | 45;
  intervalMonths?: number;
};
function saveDraft(db: DB, userId: string, draft: Draft) {
  db.prepare(
    "INSERT INTO chat_state(user_id,data,updated_at) VALUES(?,?,?) ON CONFLICT(user_id) DO UPDATE SET data=excluded.data,updated_at=excluded.updated_at",
  ).run(userId, JSON.stringify(draft), Date.now());
}
function clearDraft(db: DB, userId: string) {
  db.prepare("DELETE FROM chat_state WHERE user_id=?").run(userId);
}
function readDraft(db: DB, userId: string): Draft | undefined {
  const row = db
    .prepare("SELECT data,updated_at FROM chat_state WHERE user_id=?")
    .get(userId) as { data: string; updated_at: number } | undefined;
  if (!row || Date.now() - row.updated_at > 30 * 60_000) {
    clearDraft(db, userId);
    return;
  }
  return JSON.parse(row.data);
}
function draftInput(draft: Draft) {
  return eventInputSchema.parse({
    ...draft,
    category: templateById[draft.templateId].category,
  });
}
function prompt(db: DB, user: User, draft: Draft): ChatReply {
  saveDraft(db, user.id, draft);
  const t = templateById[draft.templateId];
  if (draft.stage === "title")
    return reply(
      "Как назвать событие? Напишите название (до 120 символов).",
      cancel,
    );
  if (draft.stage === "date")
    return reply(
      `${t.title}\n${t.dateLabel}: отправьте дату ДД.ММ.ГГГГ.\n\n${t.rule}\n\nНомера документов не нужны.`,
      cancel,
    );
  if (draft.stage === "age")
    return reply("К какому возрасту нужна замена паспорта?", [
      [
        button("20 лет", `age:${draft.nonce}:20`),
        button("45 лет", `age:${draft.nonce}:45`),
      ],
      ...cancel,
    ]);
  if (draft.stage === "interval")
    return reply(
      "Введите интервал, рекомендованный врачом, в месяцах (1–120).",
      cancel,
    );
  const input = draftInput(draft);
  return reply(
    `${draft.title}\nСрок: ${formatDate(calculateDeadline(input).dueDate)}\nСфера: ${categories[input.category]}\nНапомним за 30, 7, 1 день и в день срока.\nНапоминания сейчас ${user.settings.enabled ? "включены" : "выключены — включите их в настройках"}.\n\nДобавить событие?`,
    [[button("Добавить", `save:${draft.nonce}`)], ...cancel],
  );
}

// Runs inside the inbox transaction: state changes and the saved reply are atomic.
export function chatReply(
  db: DB,
  user: User,
  raw: string,
  callback = false,
): ChatReply {
  const text = raw.trim();
  if (callback) {
    const [action, arg, extra] = text.split(":");
    if (!["new", "age", "save"].includes(action)) clearDraft(db, user.id);
    if (action === "menu") {
      clearDraft(db, user.id);
      return reply(
        "Вовремя — сроки и следующие действия. Выберите, что сделать.",
      );
    }
    if (action === "help")
      return reply(
        "Выберите сферу и услугу кнопками, затем отправьте дату. События общие с мини-приложением. В настройках можно включить напоминания и выбрать время. Команды /help и /add также работают.",
      );
    if (action === "catalog") {
      clearDraft(db, user.id);
      if (!arg)
        return reply("В какой сфере нужно напоминание?", [
          ...Object.entries(categories).map(([id, name]) => [
            button(name, `catalog:${id}:0`),
          ]),
          ...back,
        ]);
      if (!Object.hasOwn(categories, arg))
        return reply("Сфера не найдена. Откройте каталог заново.");
      const page = Number(extra || 0);
      if (!Number.isInteger(page) || page < 0)
        return reply("Откройте каталог заново.");
      const items = templates.filter((t) => t.category === arg);
      const buttons: Keyboard = items
        .slice(page * 6, page * 6 + 6)
        .map((t) => [button(t.title.slice(0, 100), `new:${t.id}`)]);
      if (page > 0)
        buttons.push([button("Назад", `catalog:${arg}:${page - 1}`)]);
      if (items.length > (page + 1) * 6)
        buttons.push([button("Далее", `catalog:${arg}:${page + 1}`)]);
      return reply(categories[arg as Category], [
        ...buttons,
        [button("Все сферы", "catalog")],
        ...back,
      ]);
    }
    if (action === "new") {
      const t = templates.find((t) => t.id === arg);
      if (!t) return reply("Услуга не найдена. Откройте каталог заново.");
      return prompt(db, user, {
        nonce: randomUUID(),
        templateId: t.id,
        title: t.title,
        stage: t.id === "custom" ? "title" : "date",
      });
    }
    if (action === "age" || action === "save") {
      const draft = readDraft(db, user.id);
      if (!draft || draft.nonce !== arg)
        return reply(
          "Эта форма уже закрыта или устарела. Начните добавление заново.",
        );
      if (
        action === "age" &&
        draft.stage === "age" &&
        (extra === "20" || extra === "45")
      )
        return prompt(db, user, {
          ...draft,
          age: Number(extra) as 20 | 45,
          stage: "confirm",
        });
      if (action === "save" && draft.stage === "confirm") {
        if (listEvents(db, user.id).length >= 500)
          return reply(
            "Можно хранить до 500 событий. Удалите ненужные в календаре.",
          );
        const event = createEvent(db, user.id, draftInput(draft));
        clearDraft(db, user.id);
        return reply(
          `Добавлено: ${event.title}\nСрок: ${formatDate(event.dueDate)}\n${user.settings.enabled ? "Напоминания включены." : "Включите напоминания в настройках, чтобы получать сообщения о сроках."}`,
          [
            [
              button("Рекомендации", `show:${event.id}`),
              button("Настройки", "settings"),
            ],
            ...menuButtons,
          ],
        );
      }
      return reply("Сначала завершите текущий шаг формы.", cancel);
    }
    if (action === "events") {
      const page = Number(arg || 0);
      if (!Number.isInteger(page) || page < 0)
        return reply("Откройте список заново.");
      const events = listEvents(db, user.id).filter((e) => !e.completed);
      const items = events.slice(page * 5, page * 5 + 5);
      const buttons: Keyboard = items.map((e) => [
        button(
          `${formatDate(e.dueDate, true)} · ${e.title}`.slice(0, 100),
          `show:${e.id}`,
        ),
      ]);
      if (page > 0) buttons.push([button("Назад", `events:${page - 1}`)]);
      if (events.length > (page + 1) * 5)
        buttons.push([button("Далее", `events:${page + 1}`)]);
      return reply(
        items.length
          ? "Выберите событие, чтобы увидеть рекомендации или завершить его."
          : "На этой странице нет событий.",
        [...buttons, ...menuButtons],
      );
    }
    if (action === "show" || action === "done") {
      const event = listEvents(db, user.id).find((e) => e.id === arg);
      if (!event) return reply("Событие не найдено.");
      const result = commandReply(db, user, `/${action} ${event.id}`);
      return reply(
        result,
        action === "show" && !event.completed
          ? [[button("Выполнено", `done:${event.id}`)], ...menuButtons]
          : [
              [button("Добавить следующую дату", `new:${event.templateId}`)],
              ...menuButtons,
            ],
      );
    }
    if (action === "settings" || action === "enabled" || action === "privacy") {
      if (action !== "settings") {
        if (!["on", "off"].includes(arg))
          return reply("Некорректная настройка.");
        saveSettings(db, user.id, {
          ...user.settings,
          ...(action === "enabled"
            ? { enabled: arg === "on" }
            : { privateMessages: arg === "on" }),
        });
        user = getUser(db, user.id)!;
      }
      return reply(commandReply(db, user, "/settings"), [
        [
          button(
            user.settings.enabled
              ? "Выключить напоминания"
              : "Включить напоминания",
            `enabled:${user.settings.enabled ? "off" : "on"}`,
          ),
        ],
        [
          button(
            user.settings.privateMessages
              ? "Показывать рекомендации"
              : "Скрывать детали",
            `privacy:${user.settings.privateMessages ? "off" : "on"}`,
          ),
        ],
        [button("Время уведомлений", "hours"), button("Часовой пояс", "zones")],
        [button("Тестовое уведомление", "test")],
        ...back,
      ]);
    }
    if (action === "hours")
      return reply("Выберите местный час отправки.", [
        [8, 9, 12, 18, 20].map((hour) => button(`${hour}:00`, `hour:${hour}`)),
        ...back,
      ]);
    if (action === "zones")
      return reply("Выберите часовой пояс.", [
        [button("Москва", "zone:Europe/Moscow")],
        [button("Екатеринбург", "zone:Asia/Yekaterinburg")],
        [button("Новосибирск", "zone:Asia/Novosibirsk")],
        [button("Владивосток", "zone:Asia/Vladivostok")],
        ...back,
      ]);
    if (action === "hour" || action === "zone") {
      const result = commandReply(
        db,
        user,
        `/time ${action === "hour" ? arg : user.settings.hour} ${action === "zone" ? arg : user.settings.timezone}`,
      );
      return reply(result, [[button("Настройки", "settings")], ...back]);
    }
    if (action === "test") return reply(commandReply(db, user, "/test"));
    return reply("Кнопка устарела. Откройте главное меню.");
  }
  if (text === "/start" || text.toLowerCase() === "меню") {
    clearDraft(db, user.id);
    return reply(
      "Вовремя — ваши сроки и рекомендации. Начните с кнопки «Добавить событие» или откройте свои события.",
    );
  }
  if (text === "/cancel" || text.toLowerCase() === "отмена") {
    clearDraft(db, user.id);
    return reply("Добавление отменено.");
  }
  if (text.startsWith("/")) {
    clearDraft(db, user.id);
    return reply(commandReply(db, user, text));
  }
  const draft = readDraft(db, user.id);
  if (draft) {
    if (draft.stage === "title") {
      if (!text || text.length > 120)
        return reply("Название должно содержать от 1 до 120 символов.", cancel);
      return prompt(db, user, { ...draft, title: text, stage: "date" });
    }
    if (draft.stage === "date") {
      const date = text.replace(/^(\d{2})\.(\d{2})\.(\d{4})$/, "$3-$2-$1");
      if (!isDate(date))
        return reply(
          "Нужна существующая дата ДД.ММ.ГГГГ, например 01.12.2026.",
          cancel,
        );
      if (
        ["passport", "fluorography"].includes(draft.templateId) &&
        date > todayIn(user.settings.timezone)
      )
        return reply(
          "Дата рождения или прошлого обследования не может быть в будущем.",
          cancel,
        );
      return prompt(db, user, {
        ...draft,
        baseDate: date,
        stage:
          draft.templateId === "passport"
            ? "age"
            : draft.templateId === "fluorography"
              ? "interval"
              : "confirm",
      });
    }
    if (draft.stage === "interval") {
      const months = Number(text);
      if (!/^\d+$/.test(text) || months < 1 || months > 120)
        return reply(
          "Введите целое число месяцев от 1 до 120 по рекомендации врача.",
          cancel,
        );
      return prompt(db, user, {
        ...draft,
        intervalMonths: months,
        stage: "confirm",
      });
    }
    return prompt(db, user, draft);
  }
  return reply(commandReply(db, user, text));
}
