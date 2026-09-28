import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import {
  calculateDeadline,
  addMonths,
  extractDates,
  eventInputSchema,
  todayIn,
  defaultSettings,
  type EventInput,
  type User,
} from "../shared/domain.js";
import { validateInitData } from "../server/auth.js";
import {
  openDatabase,
  ensureUser,
  createEvent,
  saveSettings,
  listEvents,
} from "../server/db.js";
import {
  processReminders,
  dueReminders,
  processInbox,
  reminderText,
} from "../server/bot.js";
const input: EventInput = {
  templateId: "custom",
  title: "Важное событие",
  category: "other",
  baseDate: "2026-12-01",
  reminders: [30, 7, 1, 0],
  notes: "",
  documentName: "",
};
function sign(values: Record<string, string>, token = "test-token") {
  const data = Object.entries(values)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join("\n");
  const key = createHmac("sha256", "WebAppData").update(token).digest();
  return new URLSearchParams({
    ...values,
    hash: createHmac("sha256", key).update(data).digest("hex"),
  }).toString();
}
test("passport keeps birthday and adds 90 calendar days, including year boundaries", () => {
  assert.deepEqual(
    calculateDeadline({
      ...input,
      templateId: "passport",
      baseDate: "2006-10-20",
      age: 20,
    }),
    { milestoneDate: "2026-10-20", dueDate: "2027-01-18" },
  );
  assert.deepEqual(
    calculateDeadline({
      ...input,
      templateId: "passport",
      baseDate: "1981-01-01",
      age: 45,
    }),
    { milestoneDate: "2026-01-01", dueDate: "2026-04-01" },
  );
  assert.throws(() => calculateDeadline({ ...input, templateId: "passport" }));
});
test("months clamp leap days without shifting into March", () => {
  assert.equal(addMonths("2024-02-29", 12), "2025-02-28");
  assert.equal(addMonths("2026-01-31", 1), "2026-02-28");
  assert.equal(
    calculateDeadline({
      ...input,
      templateId: "fluorography",
      baseDate: "2024-02-29",
      intervalMonths: 24,
    }).dueDate,
    "2026-02-28",
  );
  assert.throws(() =>
    calculateDeadline({ ...input, templateId: "fluorography" }),
  );
});
test("input rejects impossible dates, invalid reminders and long titles", () => {
  for (const v of [
    { baseDate: "2026-02-30" },
    { baseDate: "garbage" },
    { reminders: [-1] },
    { title: "a".repeat(121) },
  ])
    assert.equal(eventInputSchema.safeParse({ ...input, ...v }).success, false);
});
test("document dates preserve context, reject impossible dates and deduplicate", () => {
  assert.deepEqual(
    extractDates(
      "Дата рождения 24.09.2006. Выдан 31.02.2026. До 2027-01-18 и 18/01/2027.",
    ).map((v) => v.date),
    ["2006-09-24", "2027-01-18"],
  );
});
test("MAX auth verifies signature, expiration, duplicates, future timestamps and user", () => {
  const now = Date.UTC(2026, 8, 24);
  const values = {
    auth_date: String(now / 1000),
    user: JSON.stringify({ id: 42, first_name: "Анна" }),
  };
  const raw = sign(values);
  assert.equal(validateInitData(raw, "test-token", now).id, "42");
  assert.throws(() => validateInitData(raw, "bad-token", now));
  assert.throws(() => validateInitData(raw + " &hash=x", "test-token", now));
  assert.throws(() =>
    validateInitData(raw + "&user=%7B%7D", "test-token", now),
  );
  assert.throws(() => validateInitData(raw, "test-token", now + 3601000));
  assert.throws(() => validateInitData(raw, "test-token", now - 60000));
  assert.throws(() =>
    validateInitData(sign({ ...values, user: '{"id":-1}' }), "test-token", now),
  );
});
test("timezone sends at the selected local hour and minute", () => {
  const now = new Date("2026-11-24T02:00:00Z");
  assert.equal(todayIn("Asia/Novosibirsk", now), "2026-11-24");
  const db = openDatabase(":memory:");
  const e = createEvent(db, ensureUser(db, "1", "А").id, input);
  const u: User = {
    id: "1",
    name: "А",
    demo: false,
    botStarted: true,
    settings: {
      ...defaultSettings,
      enabled: true,
      timezone: "Asia/Novosibirsk",
    },
  };
  assert.equal(dueReminders(e, u, now)[0].kind, "days-7");
  const precise = { ...u, settings: { ...u.settings, minute: 37 } };
  assert.equal(
    dueReminders(e, precise, new Date("2026-11-24T02:36:00Z")).length,
    0,
  );
  assert.equal(
    dueReminders(e, precise, new Date("2026-11-24T02:37:00Z")).length,
    1,
  );
  assert.equal(
    dueReminders(
      e,
      { ...u, settings: { ...u.settings, timezone: "Europe/Moscow" } },
      now,
    ).length,
    0,
  );
  assert.equal(
    dueReminders(e, { ...u, settings: { ...u.settings, enabled: false } }, now)
      .length,
    0,
  );
  assert.equal(dueReminders(e, { ...u, demo: true }, now).length, 0);
  db.close();
});
test("scheduler survives retries without duplicating confirmed messages; completed events are excluded", async () => {
  const db = openDatabase(":memory:");
  ensureUser(db, "1", "А");
  saveSettings(db, "1", { ...defaultSettings, enabled: true });
  db.prepare("UPDATE users SET bot_started=1").run();
  createEvent(db, "1", input);
  let attempts = 0;
  const sent: string[] = [];
  const send = async (_id: string, text: string) => {
    if (attempts++ === 0) throw new Error("offline");
    sent.push(text);
  };
  const time = new Date("2026-11-24T07:00:00Z");
  await processReminders(db, send, time);
  assert.equal(sent.length, 0);
  await processReminders(db, send, new Date(time.getTime() + 60000));
  assert.equal(attempts, 1);
  await processReminders(db, send, new Date(time.getTime() + 300001));
  assert.equal(sent.length, 1);
  await processReminders(db, send, new Date(time.getTime() + 600000));
  assert.equal(sent.length, 1);
  const event = listEvents(db, "1")[0];
  event.completed = true;
  db.prepare("UPDATE events SET data=?").run(JSON.stringify(event));
  await processReminders(db, send, new Date("2026-11-30T07:00:00Z"));
  assert.equal(sent.length, 1);
  db.close();
});
test("birthday notification occurs independently of deadline reminders and hides private details", () => {
  const db = openDatabase(":memory:");
  const u = ensureUser(db, "1", "А");
  const e = createEvent(db, "1", {
    ...input,
    templateId: "passport",
    age: 20,
    baseDate: "2006-09-24",
    reminders: [],
  });
  const user = {
    ...u,
    botStarted: true,
    settings: { ...defaultSettings, enabled: true },
  };
  assert.equal(
    dueReminders(e, user, new Date("2026-09-24T07:00:00Z"))[0].kind,
    "birthday",
  );
  assert.ok(!reminderText(e, user, "2026-09-24", true).includes(e.title));
  db.close();
});
test("catch-up only selects latest relevant threshold", () => {
  const db = openDatabase(":memory:");
  const u = ensureUser(db, "1", "А");
  const e = createEvent(db, "1", input);
  const user = {
    ...u,
    botStarted: true,
    settings: { ...defaultSettings, enabled: true },
  };
  assert.equal(
    dueReminders(e, user, new Date("2026-12-01T07:00:00Z")).length,
    1,
  );
  assert.equal(
    dueReminders(e, user, new Date("2026-12-01T07:00:00Z"))[0].kind,
    "days-0",
  );
  assert.equal(
    dueReminders(e, user, new Date("2026-12-10T07:00:00Z")).length,
    0,
  );
  db.close();
});
test("inbox processes private commands, ignores groups, and does not repeat completed replies", async () => {
  const db = openDatabase(":memory:");
  const add = (id: string, chat_type: string, text: string) =>
    db.prepare("INSERT INTO inbox(id,payload) VALUES(?,?)").run(
      id,
      JSON.stringify({
        update_type: "message_created",
        message: {
          sender: { user_id: 42, first_name: "Анна" },
          recipient: { chat_type },
          body: { text },
        },
      }),
    );
  let count = 0;
  const send = async () => {
    count++;
  };
  add("group", "chat", "/resume");
  await processInbox(db, send);
  assert.equal(count, 0);
  add("direct", "dialog", "/resume");
  await processInbox(db, send);
  assert.equal(count, 1);
  await processInbox(db, send);
  assert.equal(count, 1);
  db.close();
});

test("stopping MAX bot cancels consent without sending a reply", async () => {
  const db = openDatabase(":memory:");
  ensureUser(db, "42", "Анна");
  saveSettings(db, "42", { ...defaultSettings, enabled: true });
  db.prepare("UPDATE users SET bot_started=1").run();
  db.prepare("INSERT INTO inbox(id,payload) VALUES(?,?)").run(
    "stop",
    JSON.stringify({ update_type: "bot_stopped", user: { user_id: 42 } }),
  );
  await processInbox(db, async () => {
    throw new Error("Must not send");
  });
  const row = db
    .prepare("SELECT settings,bot_started FROM users WHERE id=?")
    .get("42") as { settings: string; bot_started: number };
  assert.equal(JSON.parse(row.settings).enabled, false);
  assert.equal(row.bot_started, 0);
  assert.equal(
    (db.prepare("SELECT status FROM inbox").get() as { status: string }).status,
    "done",
  );
  db.close();
});
