import { test } from "node:test";
import assert from "node:assert/strict";
import {
  categories,
  templates,
  eventInputSchema,
  calculateDeadline,
} from "../shared/domain.js";
import { openDatabase, ensureUser, getUser, listEvents } from "../server/db.js";
import { chatReply, type ChatReply, type Keyboard } from "../server/chat.js";
import { processInbox, processReminders, reminderText } from "../server/bot.js";

function payload(reply: ChatReply, label: string) {
  const button = reply.buttons.flat().find((b) => b.text === label);
  assert.ok(button && button.type === "callback", `Missing button: ${label}`);
  return button.payload;
}

test("every catalogue case validates, retains its sphere and uses a confirmed date", () => {
  assert.equal(templates.length, 46);
  assert.equal(new Set(templates.map((t) => t.id)).size, templates.length);
  const fields = Object.keys(templates[0]).sort();
  for (const t of templates) {
    assert.deepEqual(Object.keys(t).sort(), fields);
    assert.ok(["date", "passport", "interval"].includes(t.calculation));
    assert.ok(t.category in categories);
    assert.ok(t.steps.length >= 1);
    const input = eventInputSchema.parse({
      templateId: t.id,
      title: t.title,
      category: "other",
      baseDate: "2026-12-01",
      age: 20,
      intervalMonths: 12,
    });
    if (t.id !== "custom") assert.equal(input.category, t.category);
    if (t.id.startsWith("rf-"))
      assert.equal(calculateDeadline(input).dueDate, "2026-12-01");
  }
  assert.equal(
    eventInputSchema.safeParse({
      templateId: "rf-invalid",
      title: "x",
      category: "home",
      baseDate: "2026-12-01",
    }).success,
    false,
  );
});

test("first free-text message offers chat menu or MAX app, and visible replies contain no commands", () => {
  const db = openDatabase(":memory:");
  ensureUser(db, "42", "Тест");
  const chat = (text: string, callback = false) =>
    chatReply(db, getUser(db, "42")!, text, callback);
  try {
    const welcome = chat("Привет");
    assert.match(welcome.text, /меню чата.*мини-приложение/);
    assert.ok(
      welcome.buttons.flat().some((b) => b.text === "Добавить событие"),
    );
    const replies = [
      welcome,
      chat("help", true),
      chat("settings", true),
      chat("events:0", true),
      chat("непонятно"),
    ];
    for (const answer of replies)
      assert.doesNotMatch(
        answer.text,
        /\/(?:start|add|help|next|show|done|time|privacy|test|resume|pause)\b/i,
      );
  } finally {
    db.close();
  }
});

test("button journey creates a service, recommends steps, configures reminders and completes it", async () => {
  const db = openDatabase(":memory:");
  ensureUser(db, "42", "Тест");
  ensureUser(db, "43", "Другой");
  const chat = (text: string, callback = true, id = "42") =>
    db.transaction(() => chatReply(db, getUser(db, id)!, text, callback))();
  try {
    let answer = chat("catalog");
    answer = chat(payload(answer, "Жильё и коммунальные услуги"));
    answer = chat(payload(answer, "Поверка водосчётчика"));
    assert.match(answer.text, /Дата следующей поверки/);
    assert.match(chat("31.02.2026", false).text, /существующая дата/);
    answer = chat("01.12.2026", false);
    const save = payload(answer, "Добавить");
    assert.match(chat(save, true, "43").text, /устарела/);
    answer = chat(save);
    assert.match(answer.text, /Добавлено/);
    assert.match(chat(save).text, /устарела/);
    assert.equal(listEvents(db, "42").length, 1);
    const event = listEvents(db, "42")[0];
    assert.equal(event.category, "home");
    assert.match(chat(`show:${event.id}`, true, "43").text, /не найдено/);
    assert.match(chat(`show:${event.id}`).text, /Аршин/);
    chat("enabled:on");
    chat("privacy:off");
    chat("hour:8");
    chat("zone:Asia/Novosibirsk");
    const user = getUser(db, "42")!;
    assert.equal(user.settings.hour, 8);
    assert.equal(user.settings.timezone, "Asia/Novosibirsk");
    assert.equal(user.settings.enabled, true);
    assert.equal(user.settings.privateMessages, false);
    db.prepare("UPDATE users SET bot_started=1 WHERE id=?").run("42");
    const sent: { text: string; buttons?: Keyboard }[] = [];
    await processReminders(
      db,
      async (_id, text, buttons) => {
        sent.push({ text, buttons });
      },
      new Date("2026-12-01T03:00:00Z"),
    );
    assert.equal(sent.length, 1);
    assert.match(sent[0].text, /Что сделать:/);
    assert.match(sent[0].text, /Аршин/);
    assert.ok(
      sent[0].buttons
        ?.flat()
        .some((b) => b.type === "callback" && b.payload === `show:${event.id}`),
    );
    const privateText = reminderText(
      event,
      { ...user, settings: { ...user.settings, privateMessages: true } },
      "2026-12-01",
    );
    assert.ok(!privateText.includes(event.title));
    assert.match(privateText, /Следующие действия/);
    chat(`done:${event.id}`);
    assert.equal(listEvents(db, "42")[0].completed, true);
  } finally {
    db.close();
  }
});

test("callback responses persist through failed delivery; stale save and group callbacks cannot create events", async () => {
  const db = openDatabase(":memory:");
  ensureUser(db, "42", "Тест");
  try {
    const chat = (text: string, callback = true) =>
      chatReply(db, getUser(db, "42")!, text, callback);
    chat("new:rf-092");
    const confirm = chat("01.12.2026", false);
    const save = payload(confirm, "Добавить");
    const update = {
      update_type: "message_callback",
      callback: { callback_id: "save-1", payload: save, user: { user_id: 42 } },
      message: {
        recipient: { chat_type: "dialog" },
        sender: { user_id: 900, is_bot: true },
      },
    };
    db.prepare("INSERT INTO inbox(id,payload) VALUES(?,?)").run(
      "save-1",
      JSON.stringify(update),
    );
    await processInbox(
      db,
      async () => {
        throw Error("offline");
      },
      1000,
    );
    assert.equal(listEvents(db, "42").length, 1);
    let buttons: Keyboard | undefined;
    await processInbox(
      db,
      async (_id, _text, keyboard) => {
        buttons = keyboard;
      },
      32000,
    );
    assert.equal(listEvents(db, "42").length, 1);
    assert.ok(buttons?.flat().some((b) => b.text === "Рекомендации"));
    assert.equal(
      (db.prepare("SELECT status FROM inbox WHERE id='save-1'").get() as any)
        .status,
      "done",
    );
    chat("new:rf-051");
    const second = payload(chat("01.12.2026", false), "Добавить");
    db.prepare("INSERT INTO inbox(id,payload) VALUES(?,?)").run(
      "group",
      JSON.stringify({
        ...update,
        callback: { ...update.callback, payload: second },
        message: { recipient: { chat_type: "chat" } },
      }),
    );
    await processInbox(
      db,
      async () => {
        assert.fail("Group callback must not reply");
      },
      33000,
    );
    assert.equal(listEvents(db, "42").length, 1);
    db.prepare("UPDATE chat_state SET updated_at=0").run();
    assert.match(chat(second).text, /устарела/);
  } finally {
    db.close();
  }
});

test("passport wizard keeps age calculation; interval wizard rejects invalid values and cancellation clears state", () => {
  const db = openDatabase(":memory:");
  ensureUser(db, "42", "Тест");
  const chat = (text: string, callback = true) =>
    chatReply(db, getUser(db, "42")!, text, callback);
  try {
    chat("new:passport");
    let answer = chat("20.10.2006", false);
    answer = chat(payload(answer, "20 лет"));
    assert.match(answer.text, /18 января 2027/);
    chat(payload(answer, "Добавить"));
    assert.equal(listEvents(db, "42")[0].dueDate, "2027-01-18");
    chat("new:fluorography");
    chat("01.01.2026", false);
    assert.match(chat("0", false).text, /от 1 до 120/);
    answer = chat("12", false);
    assert.match(answer.text, /1 января 2027/);
    chat("menu");
    assert.match(chat(payload(answer, "Добавить")).text, /устарела/);
    assert.equal(listEvents(db, "42").length, 1);
  } finally {
    db.close();
  }
});
