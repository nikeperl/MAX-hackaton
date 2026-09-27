import { test } from "node:test";
import assert from "node:assert/strict";
import {
  openDatabase,
  getUser,
  listEvents,
  ensureUser,
  createEvent,
} from "../server/db.js";
import { maxSender, processInbox, processReminders } from "../server/bot.js";
import { commandReply } from "../server/commands.js";

test("MAX transport sends a notifying message with menu buttons and requires delivery acknowledgement", async () => {
  let calls = 0;
  const sender = maxSender(
    "fake-test-token",
    "https://platform-api2.max.ru",
    async <T>(url: string, token: string, payload: unknown) => {
      assert.equal(url, "https://platform-api2.max.ru/messages?user_id=42");
      assert.equal(token, "fake-test-token");
      const message = payload as any;
      assert.equal(message.notify, true);
      assert.equal(
        message.attachments[0].payload.buttons[0][0].text,
        "Добавить событие",
      );
      assert.equal(
        message.attachments[0].payload.buttons
          .flat()
          .some((button: any) => button.type === "link"),
        false,
      );
      return (
        ++calls === 1 ? {} : { message: { body: { mid: "confirmed" } } }
      ) as T;
    },
  );
  await assert.rejects(sender("42", "Тест"), /не подтвердил/);
  await sender("42", "Повтор");
  assert.equal(calls, 2);
});

test("chat-only journey creates, configures, reminds, explains and completes shared events", async () => {
  const db = openDatabase(":memory:");
  const sent: { id: string; text: string }[] = [];
  const send = async (id: string, text: string) => {
    sent.push({ id, text });
  };
  let sequence = 0;
  const chat = async (text: string, userId = 42) => {
    db.prepare("INSERT INTO inbox(id,payload) VALUES(?,?)").run(
      String(++sequence),
      JSON.stringify({
        update_type: "message_created",
        message: {
          sender: { user_id: userId, first_name: "Тест" },
          recipient: { chat_type: "dialog" },
          body: { text },
        },
      }),
    );
    await processInbox(db, send);
    return sent.at(-1)!.text;
  };
  try {
    assert.match(await chat("/start"), /меню чата/);
    assert.match(
      await chat("/add 01.12.2026 Оплатить Налог"),
      /Добавлено: Оплатить Налог/,
    );
    const event = listEvents(db, "42")[0];
    assert.equal(event.title, "Оплатить Налог");
    assert.equal(event.dueDate, "2026-12-01");
    assert.match(await chat(`/show ${event.id.slice(0, 8)}`, 43), /не найдено/);
    assert.match(await chat(`/done ${event.id.slice(0, 8)}`, 43), /не найдено/);
    assert.equal(listEvents(db, "42")[0].completed, false);
    await chat("/time 9 Asia/Novosibirsk");
    await chat("/resume");
    const count = sent.length;
    await processReminders(db, send, new Date("2026-11-24T02:00:00Z"));
    assert.equal(sent.length, count + 1);
    assert.equal(sent.at(-1)!.id, "42");
    assert.match(sent.at(-1)!.text, /Рекомендации/);
    assert.doesNotMatch(sent.at(-1)!.text, /\/show/);
    assert.ok(!sent.at(-1)!.text.includes(event.title));
    await processReminders(db, send, new Date("2026-11-24T02:01:00Z"));
    assert.equal(sent.length, count + 1);
    assert.match(await chat(`/show ${event.id.slice(0, 8)}`), /Что сделать:/);
    await chat(`/done ${event.id.slice(0, 8)}`);
    const completedCount = sent.length;
    await processReminders(db, send, new Date("2026-11-30T02:00:00Z"));
    assert.equal(sent.length, completedCount);
    assert.equal(listEvents(db, "42")[0].completed, true);
    assert.match(await chat("/next"), /Пока нет событий/);
  } finally {
    db.close();
  }
});

test("failed reply retries without creating duplicates or reverting later settings", async () => {
  const db = openDatabase(":memory:");
  const enqueue = (id: string, text: string) =>
    db.prepare("INSERT INTO inbox(id,payload) VALUES(?,?)").run(
      id,
      JSON.stringify({
        update_type: "message_created",
        message: {
          sender: { user_id: 42 },
          recipient: { chat_type: "dialog" },
          body: { text },
        },
      }),
    );
  try {
    enqueue("add", "/add 01.12.2026 Проверка");
    await processInbox(
      db,
      async () => {
        throw new Error("network timeout");
      },
      1000,
    );
    assert.equal(listEvents(db, "42").length, 1);
    let reply = "";
    await processInbox(
      db,
      async (_id, text) => {
        reply = text;
      },
      32000,
    );
    assert.match(reply, /Добавлено/);
    assert.equal(listEvents(db, "42").length, 1);
    enqueue("resume", "/resume");
    await processInbox(
      db,
      async () => {
        throw new Error("offline");
      },
      33000,
    );
    enqueue("pause", "/pause");
    await processInbox(db, async () => {}, 34000);
    await processInbox(db, async () => {}, 64000);
    assert.equal(getUser(db, "42")!.settings.enabled, false);
    assert.equal(
      (db.prepare("SELECT response FROM inbox WHERE id='add'").get() as any)
        .response,
      null,
    );
  } finally {
    db.close();
  }
});

test("chat validates dates, parameters and paginates; passport and medical calculations match calendar", () => {
  const db = openDatabase(":memory:");
  const user = ensureUser(db, "42", "Тест");
  const chat = (text: string) => commandReply(db, getUser(db, user.id)!, text);
  try {
    for (const text of [
      "/add 31.02.2026 Ошибка",
      "/add 2026-12-01",
      "/passport 20.10.2006 21",
      "/health 01.01.2026 0",
      "/health 01.01.2199 12",
      "/add 2026-12-01 " + "я".repeat(121),
    ])
      chat(text);
    assert.equal(listEvents(db, user.id).length, 0);
    chat("/time 24 Europe/Moscow");
    chat("/time 9 Not/AZone");
    assert.equal(getUser(db, user.id)!.settings.timezone, "Europe/Moscow");
    chat("/passport 20.10.2006 20");
    assert.equal(listEvents(db, user.id)[0].dueDate, "2027-01-18");
    chat("/health 29.02.2024 12");
    assert.equal(listEvents(db, user.id)[0].dueDate, "2025-02-28");
    for (let i = 0; i < 10; i++) chat(`/add 01.12.2026 Событие ${i}`);
    assert.match(chat("/next"), /Другие события доступны/);
    assert.match(chat("/next 2"), /Замена паспорта РФ/);
    assert.match(chat("/nonsense"), /меню чата/);
  } finally {
    db.close();
  }
});

test("an edit or bot stop while another reminder is sent cancels stale notifications", async () => {
  const db = openDatabase(":memory:");
  const user = ensureUser(db, "42", "Тест");
  commandReply(db, user, "/resume");
  db.prepare("UPDATE users SET bot_started=1").run();
  const input = {
    templateId: "custom" as const,
    title: "Тест",
    category: "other" as const,
    baseDate: "2026-12-01",
    reminders: [7],
    notes: "",
    documentName: "",
  };
  createEvent(db, user.id, input);
  createEvent(db, user.id, input);
  let count = 0;
  try {
    await processReminders(
      db,
      async () => {
        count++;
        db.prepare("UPDATE users SET bot_started=0").run();
      },
      new Date("2026-11-24T07:00:00Z"),
    );
    assert.equal(count, 1);
  } finally {
    db.close();
  }
});
