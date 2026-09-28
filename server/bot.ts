import {
  type DB,
  getUser,
  ensureUser,
  listEvents,
  saveSettings,
} from "./db.js";
import {
  formatDate,
  todayIn,
  addDays,
  type Deadline,
  type User,
} from "../shared/domain.js";
import { getMaxApiUrl, postMaxJson } from "./max-api.js";
import { stepsText } from "./chat-format.js";
import { chatReply, menuButtons, type Keyboard } from "./chat.js";
import { chatCopy, templateById } from "../shared/content.js";
import { createHash } from "node:crypto";
export type SendMessage = (
  userId: string,
  text: string,
  buttons?: Keyboard,
) => Promise<string | void>;
export type BotTransport = SendMessage & {
  edit?: (mid: string, text: string, buttons: Keyboard) => Promise<void>;
};
export function maxSender(
  token: string,
  apiUrl = getMaxApiUrl(),
  transport = postMaxJson,
): BotTransport {
  // One queue per process keeps both global and per-dialog limits below MAX limits.
  let queue = Promise.resolve();
  const schedule = <T>(run: () => Promise<T>) => {
    const job = queue.then(run);
    queue = job
      .catch(() => {})
      .then(() => new Promise<void>((resolve) => setTimeout(resolve, 550)));
    return job;
  };
  const send: BotTransport = (userId, text, buttons = menuButtons) =>
    schedule(async () => {
      const body = await transport<{ message?: { body?: { mid?: string } } }>(
        `${apiUrl}/messages?user_id=${encodeURIComponent(userId)}`,
        token,
        {
          text: text.slice(0, 4000),
          notify: true,
          attachments: [
            {
              type: "inline_keyboard",
              payload: {
                buttons,
              },
            },
          ],
        },
      );
      if (!body.message) throw new Error("MAX не подтвердил отправку");
      return body.message.body?.mid;
    });
  send.edit = (mid, text, buttons) =>
    schedule(async () => {
      const body = await transport<{ success: boolean }>(
        `${apiUrl}/messages?message_id=${encodeURIComponent(mid)}`,
        token,
        {
          text: text.slice(0, 4000),
          notify: false,
          attachments: [{ type: "inline_keyboard", payload: { buttons } }],
        },
        "PUT",
      );
      if (!body.success) throw new Error("MAX не подтвердил редактирование");
    });
  return send;
}
function rememberView(
  db: DB,
  mid: string | void,
  userId: string,
  buttons: Keyboard,
  lastPayload: string | null = null,
) {
  if (!mid) return;
  db.prepare(
    "INSERT INTO bot_views(mid,user_id,last_payload,buttons,updated_at) VALUES(?,?,?,?,?) ON CONFLICT(mid) DO UPDATE SET user_id=excluded.user_id,last_payload=excluded.last_payload,buttons=excluded.buttons,updated_at=excluded.updated_at",
  ).run(mid, userId, lastPayload, JSON.stringify(buttons), Date.now());
}
function acceptsCallback(db: DB, mid: string, userId: string, payload: string) {
  const view = db
    .prepare("SELECT user_id,last_payload,buttons FROM bot_views WHERE mid=?")
    .get(mid) as
    | { user_id: string; last_payload: string | null; buttons: string }
    | undefined;
  if (!view) return true;
  if (view.user_id !== userId || view.last_payload === payload) return false;
  return (JSON.parse(view.buttons) as Keyboard)
    .flat()
    .some((button) => button.type === "callback" && button.payload === payload);
}
function acceptsRecentAction(
  db: DB,
  userId: string,
  mid: string | null,
  payload: string,
  at: number,
) {
  const key = createHash("sha256")
    .update(JSON.stringify([userId, mid]))
    .digest("hex");
  const row = db
    .prepare("SELECT last_payload,last_at FROM callback_guard WHERE id=?")
    .get(key) as { last_payload: string; last_at: number } | undefined;
  const cooldown = payload === "test" ? 5000 : 1000;
  if (
    row?.last_payload === payload &&
    at >= row.last_at &&
    at - row.last_at < cooldown
  )
    return false;
  if (row && at < row.last_at) return false;
  db.prepare(
    "INSERT INTO callback_guard(id,last_payload,last_at) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET last_payload=excluded.last_payload,last_at=excluded.last_at",
  ).run(key, payload, at);
  return true;
}
export function reminderText(
  event: Deadline,
  user: User,
  today: string,
  milestone = false,
) {
  if (user.settings.privateMessages) return chatCopy.privateReminder(milestone);
  const template = templateById[event.templateId];
  return chatCopy.reminder(
    event.title,
    formatDate(event.dueDate),
    event.dueDate < today
      ? "overdue"
      : event.dueDate === today
        ? "today"
        : "future",
    milestone,
    stepsText(event, 700),
    template.details.serviceUrl ?? "",
    template.details.source?.url ?? "",
  );
}
export function dueReminders(event: Deadline, user: User, now: Date) {
  if (
    event.completed ||
    !user.settings.enabled ||
    !user.botStarted ||
    user.demo
  )
    return [];
  const today = todayIn(user.settings.timezone, now);
  const localTime = new Intl.DateTimeFormat("en-GB", {
    timeZone: user.settings.timezone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(now);
  const [hour, minute] = localTime.split(":").map(Number);
  if (
    hour < user.settings.hour ||
    (hour === user.settings.hour && minute < user.settings.minute)
  )
    return [];
  const points = event.reminders.map((offset) => ({
    date: addDays(event.dueDate, -offset),
    kind: `days-${offset}`,
    milestone: false,
  }));
  if (event.templateId === "passport" && event.milestoneDate)
    points.push({
      date: event.milestoneDate,
      kind: "birthday",
      milestone: true,
    });
  // Recover the most recent reminder within 7 days after downtime; never flood a user with all missed reminders.
  return points
    .filter((p) => p.date <= today && p.date >= addDays(today, -7))
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 1)
    .map((p) => ({ ...p, id: `${event.id}:${event.dueDate}:${p.kind}` }));
}
export async function processReminders(
  db: DB,
  send: BotTransport,
  now = new Date(),
) {
  const users = (
    db.prepare("SELECT id FROM users WHERE demo=0 AND bot_started=1").all() as {
      id: string;
    }[]
  ).map((r) => getUser(db, r.id)!);
  for (const user of users)
    for (const event of listEvents(db, user.id))
      for (const point of dueReminders(event, user, now)) {
        db.prepare(
          "INSERT OR IGNORE INTO deliveries(id,event_id,user_id,title,status) VALUES(?,?,?,?,'pending')",
        ).run(point.id, event.id, user.id, event.title);
        const claimed = db
          .prepare(
            "UPDATE deliveries SET status='sending',attempts=attempts+1,next_attempt=? WHERE id=? AND status IN ('pending','failed','sending') AND next_attempt<=?",
          )
          .run(now.getTime() + 120000, point.id, now.getTime());
        if (!claimed.changes) continue;
        // Re-check after any earlier async send: completion / pause / deletion cancels remaining work.
        const freshUser = getUser(db, user.id);
        const freshEvent = listEvents(db, user.id).find(
          (e) => e.id === event.id,
        );
        if (
          !freshUser?.settings.enabled ||
          !freshUser.botStarted ||
          freshUser.demo ||
          !freshEvent ||
          !dueReminders(freshEvent, freshUser, now).some(
            (p) => p.id === point.id,
          )
        ) {
          db.prepare("DELETE FROM deliveries WHERE id=?").run(point.id);
          continue;
        }
        try {
          const buttons: Keyboard = [
            [
              {
                type: "callback",
                text: chatCopy.buttons.recommendations,
                payload: `show:${event.id}`,
              },
              {
                type: "callback",
                text: chatCopy.buttons.completed,
                payload: `done:${event.id}`,
              },
            ],
            ...menuButtons,
          ];
          const mid = await send(
            user.id,
            reminderText(
              freshEvent,
              freshUser,
              todayIn(freshUser.settings.timezone, now),
              point.milestone,
            ),
            buttons,
          );
          rememberView(db, mid, user.id, buttons);
          db.prepare(
            "UPDATE deliveries SET status='sent',sent_at=? WHERE id=?",
          ).run(now.toISOString(), point.id);
        } catch {
          db.prepare(
            "UPDATE deliveries SET status='failed',next_attempt=? WHERE id=?",
          ).run(now.getTime() + 300000, point.id);
        }
      }
}
export async function processInbox(
  db: DB,
  send: BotTransport,
  now = Date.now(),
) {
  const rows = db
    .prepare(
      "SELECT * FROM inbox WHERE status IN ('pending','failed','sending') AND next_attempt<=? AND attempts<10 ORDER BY rowid LIMIT 20",
    )
    .all(now) as any[];
  for (const row of rows) {
    const claim = db
      .prepare(
        "UPDATE inbox SET status='sending',attempts=attempts+1,next_attempt=? WHERE id=? AND next_attempt<=?",
      )
      .run(now + 120000, row.id, now);
    if (!claim.changes) continue;
    try {
      // A retry sends the saved result without repeating creation or other mutations.
      if (row.response) {
        const reply = JSON.parse(row.response);
        if (getUser(db, reply.userId)?.botStarted) {
          if (reply.editMid && send.edit)
            await send.edit(reply.editMid, reply.text, reply.buttons);
          else {
            const mid = await send(reply.userId, reply.text, reply.buttons);
            rememberView(db, mid, reply.userId, reply.buttons);
          }
        }
        db.prepare(
          "UPDATE inbox SET status='done',payload='{}',response=NULL WHERE id=?",
        ).run(row.id);
        continue;
      }
      const update = JSON.parse(row.payload);
      if (update.update_type === "bot_stopped") {
        const id = String(update.user?.user_id || "");
        const user = getUser(db, id);
        if (user) {
          db.prepare("DELETE FROM chat_state WHERE user_id=?").run(id);
          saveSettings(db, id, { ...user.settings, enabled: false });
          db.prepare("UPDATE users SET bot_started=0 WHERE id=?").run(id);
        }
        db.prepare(
          "UPDATE inbox SET status='done',payload='{}' WHERE id=?",
        ).run(row.id);
        continue;
      }
      const source =
        update.update_type === "bot_started"
          ? update.user
          : update.update_type === "message_callback"
            ? update.callback?.user
            : update.message?.sender;
      const isDirect =
        update.update_type === "bot_started" ||
        update.message?.recipient?.chat_type === "dialog";
      if (
        !isDirect ||
        !Number.isSafeInteger(source?.user_id) ||
        source.user_id <= 0 ||
        source.is_bot
      ) {
        db.prepare(
          "UPDATE inbox SET status='done',payload='{}' WHERE id=?",
        ).run(row.id);
        continue;
      }
      const id = String(source.user_id);
      ensureUser(
        db,
        id,
        String(
          source.first_name || source.name || chatCopy.defaultUserName,
        ).slice(0, 100),
      );
      db.prepare("UPDATE users SET bot_started=1 WHERE id=?").run(id);
      const user = getUser(db, id)!;
      const text =
        update.update_type === "bot_started"
          ? "/start"
          : update.update_type === "message_callback"
            ? String(update.callback?.payload || "")
            : String(update.message?.body?.text || "");
      const sourceMid =
        update.update_type === "message_callback" &&
        typeof update.message?.body?.mid === "string"
          ? update.message.body.mid
          : null;
      const editMid =
        text !== "test" && sourceMid && send.edit ? sourceMid : null;
      const answer = db.transaction(() => {
        if (
          (sourceMid && !acceptsCallback(db, sourceMid, id, text)) ||
          (update.update_type === "message_callback" &&
            !acceptsRecentAction(
              db,
              id,
              sourceMid,
              text,
              Number.isFinite(update.timestamp) ? update.timestamp : Date.now(),
            ))
        ) {
          db.prepare(
            "UPDATE inbox SET status='done',payload='{}' WHERE id=?",
          ).run(row.id);
          return null;
        }
        const result = chatReply(
          db,
          user,
          text,
          update.update_type === "message_callback",
        );
        if (editMid) rememberView(db, editMid, id, result.buttons, text);
        db.prepare("UPDATE inbox SET response=? WHERE id=?").run(
          JSON.stringify({ userId: id, editMid, ...result }),
          row.id,
        );
        return result;
      })();
      if (!answer) continue;
      if (editMid) await send.edit!(editMid, answer.text, answer.buttons);
      else {
        const mid = await send(id, answer.text, answer.buttons);
        rememberView(db, mid, id, answer.buttons);
      }
      db.prepare(
        "UPDATE inbox SET status='done',payload='{}',response=NULL WHERE id=?",
      ).run(row.id);
    } catch {
      db.prepare(
        "UPDATE inbox SET status='failed',next_attempt=? WHERE id=?",
      ).run(now + Math.min(3600000, 30000 * 2 ** row.attempts), row.id);
    }
  }
}
