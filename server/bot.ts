import {
  type DB,
  getUser,
  ensureUser,
  listEvents,
  saveSettings,
} from "./db.js";
import {
  templates,
  formatDate,
  todayIn,
  addDays,
  type Deadline,
  type User,
} from "../shared/domain.js";
export type SendMessage = (userId: string, text: string) => Promise<void>;
export function maxSender(
  token: string,
  username: string,
  apiUrl = "https://platform-api2.max.ru",
): SendMessage {
  // One queue per process keeps both global and per-dialog limits below MAX limits.
  let queue = Promise.resolve();
  return (userId, text) => {
    const job = queue.then(async () => {
      const response = await fetch(
        `${apiUrl}/messages?user_id=${encodeURIComponent(userId)}`,
        {
          method: "POST",
          headers: { Authorization: token, "Content-Type": "application/json" },
          signal: AbortSignal.timeout(15000),
          body: JSON.stringify({
            text: text.slice(0, 4000),
            notify: true,
            ...(username
              ? {
                  attachments: [
                    {
                      type: "inline_keyboard",
                      payload: {
                        buttons: [
                          [
                            {
                              type: "link",
                              text: "Открыть календарь",
                              url: `https://max.ru/${username}?startapp`,
                            },
                          ],
                        ],
                      },
                    },
                  ],
                }
              : {}),
          }),
        },
      );
      if (!response.ok) throw new Error(`MAX HTTP ${response.status}`);
      const body = (await response.json()) as any;
      if (!body.message) throw new Error("MAX не подтвердил отправку");
    });
    queue = job
      .catch(() => {})
      .then(() => new Promise<void>((resolve) => setTimeout(resolve, 550)));
    return job;
  };
}
export function reminderText(
  event: Deadline,
  user: User,
  today: string,
  milestone = false,
) {
  if (user.settings.privateMessages)
    return `Вовремя: ${milestone ? "наступила важная дата" : "приближается срок события"} в вашем календаре. Откройте мини-приложение, чтобы посмотреть дату и рекомендации.`;
  const template = templates.find((t) => t.id === event.templateId)!;
  return `Вовремя · ${event.title}\n${milestone ? "Наступила дата замены паспорта.\n" : ""}${event.dueDate < today ? "Срок прошёл" : event.dueDate === today ? "Срок сегодня" : "Срок"}: ${formatDate(event.dueDate)}\n\n${template.steps.join("\n")}\n${event.notes ? `\nВаша заметка: ${event.notes}\n` : ""}${"source" in template ? `\nИсточник: ${template.source}` : ""}`;
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
  const hour = Number(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: user.settings.timezone,
      hour: "2-digit",
      hourCycle: "h23",
    }).format(now),
  );
  if (hour < user.settings.hour) return [];
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
  send: SendMessage,
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
          !freshEvent ||
          freshEvent.completed
        ) {
          db.prepare("DELETE FROM deliveries WHERE id=?").run(point.id);
          continue;
        }
        try {
          await send(
            user.id,
            reminderText(
              freshEvent,
              freshUser,
              todayIn(user.settings.timezone, now),
              point.milestone,
            ),
          );
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
  send: SendMessage,
  now = Date.now(),
) {
  const rows = db
    .prepare(
      "SELECT * FROM inbox WHERE status IN ('pending','failed','sending') AND next_attempt<=? AND attempts<10 LIMIT 20",
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
      const update = JSON.parse(row.payload);
      if (update.update_type === "bot_stopped") {
        const id = String(update.user?.user_id || "");
        const user = getUser(db, id);
        if (user) {
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
        String(source.first_name || source.name || "Пользователь").slice(
          0,
          100,
        ),
      );
      db.prepare("UPDATE users SET bot_started=1 WHERE id=?").run(id);
      const user = getUser(db, id)!;
      const text = String(update.message?.body?.text || "/start")
        .trim()
        .toLowerCase();
      let answer =
        "Я помогу не пропустить важные сроки. Откройте календарь, добавьте событие или распознайте документ.\n\n/next — ближайшие события\n/pause — выключить напоминания\n/resume — включить напоминания\n/help — помощь\n\nВ настройках календаря выберите время и включите напоминания. Фото и PDF загружаются в мини-приложении.";
      if (text === "/pause") {
        saveSettings(db, id, { ...user.settings, enabled: false });
        answer = "Напоминания выключены. Включить снова: /resume.";
      } else if (text === "/resume") {
        saveSettings(db, id, { ...user.settings, enabled: true });
        answer = `Напоминания включены на ${user.settings.hour}:00 (${user.settings.timezone}). Детали сообщений можно настроить в календаре.`;
      } else if (text === "/next") {
        const events = listEvents(db, id)
          .filter((e) => !e.completed)
          .slice(0, 5);
        answer = events.length
          ? events
              .map((e) => `${formatDate(e.dueDate)} — ${e.title}`)
              .join("\n")
          : "Пока нет событий. Добавьте первое в календаре.";
      }
      await send(id, answer);
      db.prepare("UPDATE inbox SET status='done',payload='{}' WHERE id=?").run(
        row.id,
      );
    } catch {
      db.prepare(
        "UPDATE inbox SET status='failed',next_attempt=? WHERE id=?",
      ).run(now + Math.min(3600000, 30000 * 2 ** row.attempts), row.id);
    }
  }
}
