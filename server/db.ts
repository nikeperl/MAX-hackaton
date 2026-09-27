import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { randomUUID } from "node:crypto";
import {
  defaultSettings,
  calculateDeadline,
  type Deadline,
  type EventInput,
  type User,
  type Settings,
  addDays,
  addMonths,
  templateById,
  resolveTemplateId,
  todayIn,
} from "../shared/domain.js";
export function openDatabase(path: string) {
  if (path !== ":memory:")
    mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const db = new Database(path);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.pragma("busy_timeout = 5000");
  db.exec(`CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY,name TEXT NOT NULL,settings TEXT NOT NULL,bot_started INTEGER DEFAULT 0,demo INTEGER DEFAULT 0);
 CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY,user_id TEXT REFERENCES users(id) ON DELETE CASCADE,expires INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS events (id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,data TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS deliveries (id TEXT PRIMARY KEY,event_id TEXT REFERENCES events(id) ON DELETE CASCADE,user_id TEXT REFERENCES users(id) ON DELETE CASCADE,title TEXT NOT NULL,status TEXT NOT NULL,sent_at TEXT,attempts INTEGER DEFAULT 0,next_attempt INTEGER DEFAULT 0);
 CREATE TABLE IF NOT EXISTS inbox (id TEXT PRIMARY KEY,payload TEXT NOT NULL,status TEXT DEFAULT 'pending',attempts INTEGER DEFAULT 0,next_attempt INTEGER DEFAULT 0);
 CREATE TABLE IF NOT EXISTS chat_state (user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,data TEXT NOT NULL,updated_at INTEGER NOT NULL);
 CREATE INDEX IF NOT EXISTS events_user ON events(user_id);`);
  // Persist a command's result with its mutations before attempting network delivery.
  const columns = db.prepare("PRAGMA table_info(inbox)").all() as {
    name: string;
  }[];
  if (!columns.some((column) => column.name === "response"))
    db.exec("ALTER TABLE inbox ADD COLUMN response TEXT");
  return db;
}
export type DB = ReturnType<typeof openDatabase>;
export function getUser(db: DB, id: string): User | undefined {
  const row = db.prepare("SELECT * FROM users WHERE id=?").get(id) as any;
  return row
    ? {
        id: row.id,
        name: row.name,
        settings: JSON.parse(row.settings),
        botStarted: !!row.bot_started,
        demo: !!row.demo,
      }
    : undefined;
}
export function ensureUser(db: DB, id: string, name: string, demo = false) {
  db.prepare(
    "INSERT INTO users(id,name,settings,demo) VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name",
  ).run(id, name, JSON.stringify(defaultSettings), Number(demo));
  return getUser(db, id)!;
}
export function saveSettings(db: DB, id: string, settings: Settings) {
  db.prepare("UPDATE users SET settings=? WHERE id=?").run(
    JSON.stringify(settings),
    id,
  );
}
export function listEvents(db: DB, id: string): Deadline[] {
  return (
    db.prepare("SELECT data FROM events WHERE user_id=?").all(id) as {
      data: string;
    }[]
  )
    .map((r) => {
      const event = JSON.parse(r.data) as Deadline;
      const templateId = resolveTemplateId(event.templateId);
      if (!templateId)
        throw new Error(
          `Неизвестная услуга в сохранённом событии: ${event.templateId}`,
        );
      return {
        ...event,
        templateId,
        category:
          templateId === "custom"
            ? event.category
            : templateById[templateId].category,
      };
    })
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
}
export function createEvent(db: DB, userId: string, input: EventInput) {
  const e: Deadline = {
    ...input,
    ...calculateDeadline(input),
    reminders: [...new Set(input.reminders)].sort((a, b) => b - a),
    id: randomUUID(),
    completed: false,
    createdAt: new Date().toISOString(),
  };
  db.prepare("INSERT INTO events(id,user_id,data) VALUES(?,?,?)").run(
    e.id,
    userId,
    JSON.stringify(e),
  );
  return e;
}
export function seedDemo(db: DB, id: string) {
  const t = todayIn();
  const samples: EventInput[] = [
    {
      templateId: "passport",
      title: templateById.passport.title,
      category: "documents",
      baseDate: addMonths(addDays(t, -85), -240),
      age: 20,
      reminders: [30, 7, 1, 0],
      notes: "Пример: замена паспорта в 20 лет",
      documentName: "Пример паспорта",
    },
    {
      templateId: "fluorography",
      title: templateById.fluorography.title,
      category: "health",
      baseDate: addMonths(addDays(t, 12), -12),
      intervalMonths: 12,
      reminders: [30, 7, 1, 0],
      notes: "Пример интервала, назначенного врачом",
      documentName: "Пример справки",
    },
    {
      templateId: "tax",
      title: templateById.tax.title,
      category: "payments",
      baseDate: `${t.slice(0, 4)}-12-01`,
      reminders: [30, 7, 1, 0],
      notes: "Пример. Проверьте дату в своём уведомлении",
      documentName: "Пример уведомления ФНС",
    },
    {
      templateId: "insurance",
      title: templateById.insurance.title,
      category: "documents",
      baseDate: addDays(t, 22),
      reminders: [30, 7, 1, 0],
      notes: "Пример полиса",
      documentName: "",
    },
  ];
  samples.forEach((s) => createEvent(db, id, s));
}
