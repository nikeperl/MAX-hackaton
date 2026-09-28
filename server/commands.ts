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
import { chatCopy, templateById } from "../shared/content.js";
import { eventDetails, statusText } from "./chat-format.js";

function parseDate(raw: string) {
  const match = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(raw);
  const date = match ? `${match[3]}-${match[2]}-${match[1]}` : raw;
  return isDate(date) ? date : null;
}

// Synchronous: the inbox worker wraps this function and its saved reply in one transaction.
export function commandReply(db: DB, user: User, raw: string) {
  const [word = "", ...args] = raw.trim().split(/\s+/);
  const aliases: Record<string, string> = chatCopy.aliases;
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
  if (command === "/test") return chatCopy.legacy.test(statusText(user));
  if (command === "/time") {
    const result = settingsSchema.safeParse({
      ...user.settings,
      hour: /^\d{1,2}(?::\d{2})?$/.test(args[0] || "")
        ? Number(args[0].split(":")[0])
        : -1,
      minute: args[0]?.includes(":") ? Number(args[0].split(":")[1]) : 0,
      timezone: args[1] || "",
    });
    if (args.length !== 2 || !result.success) return chatCopy.legacy.chooseTime;
    saveSettings(db, user.id, result.data);
    return statusText(getUser(db, user.id)!);
  }
  if (command === "/privacy") {
    if (args.length !== 1 || !["on", "off"].includes(args[0]))
      return chatCopy.legacy.choosePrivacy;
    saveSettings(db, user.id, {
      ...user.settings,
      privateMessages: args[0] === "on",
    });
    return statusText(getUser(db, user.id)!);
  }
  if (["/add", "/passport", "/health"].includes(command)) {
    const date = parseDate(args[0] || "");
    if (!date) return chatCopy.legacy.dateRequired;
    if (command !== "/add" && date > todayIn(user.settings.timezone))
      return chatCopy.legacy.futureDate;
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
              title: templateById.passport.title,
              category: "documents",
              age: Number(args[1]) as 20 | 45,
            }
          : {
              templateId: "fluorography",
              title: templateById.fluorography.title,
              category: "health",
              intervalMonths: Number(args[1]),
            };
    const parsed = eventInputSchema.safeParse({ ...input, baseDate: date });
    if (!parsed.success || (command !== "/add" && args.length !== 2))
      return chatCopy.legacy.invalidEvent;
    if (listEvents(db, user.id).length >= 500)
      return chatCopy.messages.eventLimit;
    const event = createEvent(db, user.id, parsed.data);
    return chatCopy.legacy.saved(
      event.title,
      formatDate(event.dueDate),
      command === "/add",
      command === "/health",
      statusText(user),
    );
  }
  if (command === "/next") {
    const events = listEvents(db, user.id).filter((event) => !event.completed);
    const offset = args.length === 0 ? 0 : Number(args[0]) - 1;
    if (args.length > 1 || !Number.isInteger(offset) || offset < 0)
      return chatCopy.legacy.openEvents;
    const page = events.slice(offset * 10, (offset + 1) * 10);
    if (!page.length)
      return events.length
        ? chatCopy.legacy.pageEmpty
        : chatCopy.legacy.allEmpty;
    return (
      page
        .map((event) =>
          chatCopy.legacy.eventLine(
            formatDate(event.dueDate),
            event.title,
            event.dueDate < todayIn(user.settings.timezone),
          ),
        )
        .join("\n\n") +
      (events.length > (offset + 1) * 10 ? chatCopy.legacy.otherEvents : "")
    );
  }
  if (command === "/show" || command === "/done") {
    if (args.length !== 1 || !/^[a-f0-9-]{8,36}$/i.test(args[0]))
      return chatCopy.legacy.chooseEvent;
    const matches = listEvents(db, user.id).filter((event) =>
      event.id.startsWith(args[0].toLowerCase()),
    );
    if (matches.length !== 1) return chatCopy.legacy.eventMissing;
    const event = matches[0];
    if (command === "/done") {
      db.prepare("UPDATE events SET data=? WHERE id=? AND user_id=?").run(
        JSON.stringify({ ...event, completed: true }),
        event.id,
        user.id,
      );
      return chatCopy.legacy.done(event.title);
    }
    return eventDetails(event);
  }
  return chatCopy.unknown;
}
