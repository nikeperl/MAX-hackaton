import { randomUUID } from "node:crypto";
import {
  categories,
  templates,
  templateById,
  resolveTemplateId,
  sortTemplatesForDisplay,
  eventInputSchema,
  calculateDeadline,
  formatDate,
  isDate,
  todayIn,
  settingsSchema,
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
import { chatCopy } from "../shared/content.js";

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
  [
    button(chatCopy.buttons.addEvent, "catalog"),
    button(chatCopy.buttons.myEvents, "events:0"),
  ],
  [
    button(chatCopy.buttons.settings, "settings"),
    button(chatCopy.buttons.help, "help"),
  ],
];
const back: Keyboard = [[button(chatCopy.buttons.mainMenu, "menu")]];
const cancel: Keyboard = [[button(chatCopy.buttons.cancel, "menu")]];
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
  const draft = JSON.parse(row.data) as Draft;
  const templateId = resolveTemplateId(draft.templateId);
  if (!templateId) {
    clearDraft(db, userId);
    return;
  }
  return { ...draft, templateId };
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
  if (draft.stage === "title") return reply(chatCopy.prompts.title, cancel);
  if (draft.stage === "date")
    return reply(chatCopy.prompts.date(t.title, t.dateLabel, t.rule), cancel);
  if (draft.stage === "age")
    return reply(chatCopy.prompts.age, [
      [
        button(chatCopy.buttons.age20, `age:${draft.nonce}:20`),
        button(chatCopy.buttons.age45, `age:${draft.nonce}:45`),
      ],
      ...cancel,
    ]);
  if (draft.stage === "interval")
    return reply(chatCopy.prompts.interval, cancel);
  const input = draftInput(draft);
  return reply(
    chatCopy.prompts.confirmation(
      draft.title,
      formatDate(calculateDeadline(input).dueDate),
      categories[input.category],
      user.settings.enabled,
    ),
    [[button(chatCopy.buttons.add, `save:${draft.nonce}`)], ...cancel],
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
      return reply(chatCopy.messages.menu);
    }
    if (action === "help") return reply(chatCopy.help);
    if (action === "catalog") {
      clearDraft(db, user.id);
      if (!arg)
        return reply(chatCopy.prompts.category, [
          ...Object.entries(categories).map(([id, name]) => [
            button(name, `catalog:${id}:0`),
          ]),
          ...back,
        ]);
      if (!Object.hasOwn(categories, arg))
        return reply(chatCopy.messages.categoryMissing);
      const page = Number(extra || 0);
      if (!Number.isInteger(page) || page < 0)
        return reply(chatCopy.messages.catalogReset);
      const items = sortTemplatesForDisplay(
        templates.filter((t) => t.category === arg),
      );
      const buttons: Keyboard = items
        .slice(page * 6, page * 6 + 6)
        .map((t) => [button(t.title.slice(0, 100), `new:${t.id}`)]);
      if (page > 0)
        buttons.push([
          button(chatCopy.buttons.previous, `catalog:${arg}:${page - 1}`),
        ]);
      if (items.length > (page + 1) * 6)
        buttons.push([
          button(chatCopy.buttons.next, `catalog:${arg}:${page + 1}`),
        ]);
      return reply(categories[arg as Category], [
        ...buttons,
        [button(chatCopy.buttons.allCategories, "catalog")],
        ...back,
      ]);
    }
    if (action === "new") {
      const t = templates.find((t) => t.id === resolveTemplateId(arg));
      if (!t) return reply(chatCopy.messages.serviceMissing);
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
        return reply(chatCopy.messages.formExpired);
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
          return reply(chatCopy.messages.eventLimit);
        const event = createEvent(db, user.id, draftInput(draft));
        clearDraft(db, user.id);
        return reply(
          chatCopy.messages.eventSaved(
            event.title,
            formatDate(event.dueDate),
            user.settings.enabled,
          ),
          [
            [button(chatCopy.buttons.recommendations, `show:${event.id}`)],
            ...menuButtons,
          ],
        );
      }
      return reply(chatCopy.messages.finishStep, cancel);
    }
    if (action === "events") {
      const page = Number(arg || 0);
      if (!Number.isInteger(page) || page < 0)
        return reply(chatCopy.messages.eventsReset);
      const events = listEvents(db, user.id).filter((e) => !e.completed);
      const items = events.slice(page * 5, page * 5 + 5);
      const buttons: Keyboard = items.map((e) => [
        button(
          `${formatDate(e.dueDate, true)} · ${e.title}`.slice(0, 100),
          `show:${e.id}`,
        ),
      ]);
      if (page > 0)
        buttons.push([button(chatCopy.buttons.previous, `events:${page - 1}`)]);
      if (events.length > (page + 1) * 5)
        buttons.push([button(chatCopy.buttons.next, `events:${page + 1}`)]);
      return reply(
        items.length ? chatCopy.prompts.events : chatCopy.messages.eventsEmpty,
        [...buttons, ...menuButtons],
      );
    }
    if (action === "show" || action === "done") {
      const event = listEvents(db, user.id).find((e) => e.id === arg);
      if (!event) return reply(chatCopy.messages.eventMissing);
      const result = commandReply(db, user, `/${action} ${event.id}`);
      return reply(
        result,
        action === "show" && !event.completed
          ? [
              [button(chatCopy.buttons.completed, `done:${event.id}`)],
              ...menuButtons,
            ]
          : [
              [button(chatCopy.buttons.nextDate, `new:${event.templateId}`)],
              ...menuButtons,
            ],
      );
    }
    if (action === "settings" || action === "enabled" || action === "privacy") {
      if (action !== "settings") {
        if (!["on", "off"].includes(arg))
          return reply(chatCopy.messages.invalidSetting);
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
              ? chatCopy.buttons.disableReminders
              : chatCopy.buttons.enableReminders,
            `enabled:${user.settings.enabled ? "off" : "on"}`,
          ),
        ],
        [
          button(
            user.settings.privateMessages
              ? chatCopy.buttons.showRecommendations
              : chatCopy.buttons.hideDetails,
            `privacy:${user.settings.privateMessages ? "off" : "on"}`,
          ),
        ],
        [
          button(chatCopy.buttons.notificationTime, "hours"),
          button(chatCopy.buttons.timezone, "zones"),
        ],
        [button(chatCopy.buttons.testNotification, "test")],
        ...back,
      ]);
    }
    if (action === "hours") return reply(chatCopy.prompts.localTime, back);
    if (action === "zones")
      return reply(chatCopy.prompts.timezone, [
        ...chatCopy.timezones.map((zone) => [
          button(zone.title, `zone:${zone.value}`),
        ]),
        ...back,
      ]);
    if (action === "hour" || action === "zone") {
      const result = commandReply(
        db,
        user,
        `/time ${action === "hour" ? arg : `${user.settings.hour}:${String(user.settings.minute).padStart(2, "0")}`} ${action === "zone" ? arg : user.settings.timezone}`,
      );
      return reply(result, [
        [button(chatCopy.buttons.settings, "settings")],
        ...back,
      ]);
    }
    if (action === "test") return reply(commandReply(db, user, "/test"));
    return reply(chatCopy.messages.staleButton);
  }
  if (text === "/start" || text.toLowerCase() === chatCopy.input.menu) {
    clearDraft(db, user.id);
    return reply(chatCopy.welcome);
  }
  if (text === "/cancel" || text.toLowerCase() === chatCopy.input.cancel) {
    clearDraft(db, user.id);
    return reply(chatCopy.messages.cancelled);
  }
  if (text.startsWith("/")) {
    clearDraft(db, user.id);
    return reply(commandReply(db, user, text));
  }
  if (/^\d{1,2}:\d{1,2}$/.test(text)) {
    const valid = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(text);
    if (!valid) return reply(chatCopy.messages.invalidTime, back);
    const result = settingsSchema.parse({
      ...user.settings,
      hour: Number(valid[1]),
      minute: Number(valid[2]),
    });
    saveSettings(db, user.id, result);
    return reply(commandReply(db, getUser(db, user.id)!, "/settings"), [
      [button(chatCopy.buttons.settings, "settings")],
      ...back,
    ]);
  }
  const draft = readDraft(db, user.id);
  if (draft) {
    if (draft.stage === "title") {
      if (!text || text.length > 120)
        return reply(chatCopy.messages.invalidTitle, cancel);
      return prompt(db, user, { ...draft, title: text, stage: "date" });
    }
    if (draft.stage === "date") {
      const date = text.replace(/^(\d{2})\.(\d{2})\.(\d{4})$/, "$3-$2-$1");
      if (!isDate(date)) return reply(chatCopy.messages.invalidDate, cancel);
      const calculation = templateById[draft.templateId].calculation;
      if (calculation !== "date" && date > todayIn(user.settings.timezone))
        return reply(chatCopy.messages.futureDate, cancel);
      return prompt(db, user, {
        ...draft,
        baseDate: date,
        stage:
          calculation === "passport"
            ? "age"
            : calculation === "interval"
              ? "interval"
              : "confirm",
      });
    }
    if (draft.stage === "interval") {
      const months = Number(text);
      if (!/^\d+$/.test(text) || months < 1 || months > 120)
        return reply(chatCopy.messages.invalidInterval, cancel);
      return prompt(db, user, {
        ...draft,
        intervalMonths: months,
        stage: "confirm",
      });
    }
    return prompt(db, user, draft);
  }
  return reply(chatCopy.unknown);
}
