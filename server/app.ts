import express from "express";
import { randomBytes, randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { z } from "zod";
import {
  type DB,
  ensureUser,
  getUser,
  listEvents,
  createEvent,
  saveSettings,
  seedDemo,
} from "./db.js";
import { validateInitData, hashToken, safeEqual } from "./auth.js";
import {
  eventInputSchema,
  settingsSchema,
  calculateDeadline,
} from "../shared/domain.js";
export type Config = {
  demo: boolean;
  token: string;
  username: string;
  webhookSecret: string;
  production: boolean;
};
export function createApp(db: DB, config: Config) {
  const app = express();
  app.disable("x-powered-by");
  app.use(express.json({ limit: "64kb" }));
  app.use((_req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "no-referrer");
    next();
  });
  const limits = new Map<string, { count: number; until: number }>();
  app.use("/api", (req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    const key = req.ip || "local";
    const now = Date.now();
    if (limits.size > 10000)
      for (const [k, v] of limits) if (v.until < now) limits.delete(k);
    let entry = limits.get(key);
    if (!entry || entry.until < now) {
      entry = { count: 0, until: now + 60000 };
      limits.set(key, entry);
    }
    if (++entry.count > 240) {
      res
        .status(429)
        .json({ error: "Слишком много запросов. Попробуйте через минуту." });
      return;
    }
    next();
  });
  app.get("/api/config", (_req, res) =>
    res.json({
      demo: config.demo,
      botUrl: config.username ? `https://max.ru/${config.username}` : null,
    }),
  );
  app.get("/api/health", (_req, res) => res.json({ ok: true }));
  app.post("/api/max/webhook", (req, res) => {
    if (
      !config.webhookSecret ||
      !safeEqual(req.get("X-Max-Bot-Api-Secret") || "", config.webhookSecret)
    ) {
      res.sendStatus(403);
      return;
    }
    const update = req.body;
    if (
      !["bot_started", "bot_stopped", "message_created"].includes(
        update?.update_type,
      )
    ) {
      res.sendStatus(200);
      return;
    }
    if (!Number.isFinite(update.timestamp)) {
      res.sendStatus(400);
      return;
    }
    // Persist before acknowledging. Retries of the same update cannot enqueue another reply.
    const id = hashToken(
      JSON.stringify([
        update.update_type,
        update.timestamp,
        update.message?.body?.mid || update.user?.user_id || "",
        update.message?.sender?.user_id || "",
      ]),
    );
    db.prepare("INSERT OR IGNORE INTO inbox(id,payload) VALUES(?,?)").run(
      id,
      JSON.stringify(update),
    );
    res.sendStatus(200);
  });
  app.post("/api/session", (req, res) => {
    try {
      const input = z
        .object({ initData: z.string().max(20000).optional() })
        .parse(req.body);
      let user;
      if (input.initData) {
        const verified = validateInitData(input.initData, config.token);
        user = ensureUser(db, verified.id, verified.name);
      } else if (config.demo) {
        user = ensureUser(db, `demo-${randomUUID()}`, "Гость", true);
      } else {
        res
          .status(401)
          .json({ error: "Откройте мини-приложение через вашего бота MAX." });
        return;
      }
      const token = randomBytes(32).toString("hex");
      db.prepare("DELETE FROM sessions WHERE expires<?").run(Date.now());
      db.prepare("INSERT INTO sessions VALUES(?,?,?)").run(
        hashToken(token),
        user.id,
        Date.now() + (user.demo ? 30 * 86400000 : 3600000),
      );
      res.json({ token, user });
    } catch {
      res
        .status(401)
        .json({
          error:
            "Не удалось подтвердить вход. Откройте приложение заново через MAX.",
        });
    }
  });
  app.use("/api", (req, res, next) => {
    const token = (req.get("Authorization") || "").replace(/^Bearer /, "");
    const session = db
      .prepare("SELECT user_id FROM sessions WHERE token=? AND expires>?")
      .get(hashToken(token), Date.now()) as { user_id: string } | undefined;
    if (!session) {
      res
        .status(401)
        .json({ error: "Сессия истекла. Откройте приложение заново." });
      return;
    }
    if (!config.demo && getUser(db, session.user_id)?.demo) {
      res
        .status(401)
        .json({ error: "Демосессия недоступна. Войдите через MAX." });
      return;
    }
    res.locals.userId = session.user_id;
    next();
  });
  app.get("/api/me", (_req, res) => res.json(getUser(db, res.locals.userId)));
  app.get("/api/events", (_req, res) =>
    res.json(listEvents(db, res.locals.userId)),
  );
  app.post("/api/events", (req, res) => {
    const input = eventInputSchema.parse(req.body);
    if (listEvents(db, res.locals.userId).length >= 500) {
      res.status(400).json({ error: "Можно хранить до 500 событий." });
      return;
    }
    res.status(201).json(createEvent(db, res.locals.userId, input));
  });
  app.put("/api/events/:id", (req, res) => {
    const input = eventInputSchema.parse(req.body);
    const old = listEvents(db, res.locals.userId).find(
      (e) => e.id === req.params.id,
    );
    if (!old) {
      res.sendStatus(404);
      return;
    }
    const event = {
      ...old,
      ...input,
      ...calculateDeadline(input),
      milestoneDate: calculateDeadline(input).milestoneDate,
    };
    db.transaction(() => {
      db.prepare("UPDATE events SET data=? WHERE id=? AND user_id=?").run(
        JSON.stringify(event),
        event.id,
        res.locals.userId,
      );
      db.prepare(
        "DELETE FROM deliveries WHERE event_id=? AND status != 'sent'",
      ).run(event.id);
    })();
    res.json(event);
  });
  app.patch("/api/events/:id", (req, res) => {
    const { completed } = z.object({ completed: z.boolean() }).parse(req.body);
    const e = listEvents(db, res.locals.userId).find(
      (v) => v.id === req.params.id,
    );
    if (!e) {
      res.sendStatus(404);
      return;
    }
    e.completed = completed;
    db.prepare("UPDATE events SET data=? WHERE id=? AND user_id=?").run(
      JSON.stringify(e),
      e.id,
      res.locals.userId,
    );
    res.json(e);
  });
  app.delete("/api/events/:id", (req, res) => {
    const result = db
      .prepare("DELETE FROM events WHERE id=? AND user_id=?")
      .run(req.params.id, res.locals.userId);
    res.sendStatus(result.changes ? 204 : 404);
  });
  app.put("/api/settings", (req, res) => {
    const settings = settingsSchema.parse(req.body);
    saveSettings(db, res.locals.userId, settings);
    res.json(settings);
  });
  app.get("/api/deliveries", (_req, res) =>
    res.json(
      db
        .prepare(
          "SELECT id,event_id AS eventId,title,sent_at AS sentAt,status FROM deliveries WHERE user_id=? ORDER BY rowid DESC LIMIT 100",
        )
        .all(res.locals.userId),
    ),
  );
  app.post("/api/demo/seed", (_req, res) => {
    const user = getUser(db, res.locals.userId)!;
    if (!config.demo || !user.demo) {
      res.sendStatus(403);
      return;
    }
    if (listEvents(db, user.id).length === 0)
      db.transaction(() => seedDemo(db, user.id))();
    res.json(listEvents(db, user.id));
  });
  app.delete("/api/data", (_req, res) => {
    db.transaction(() => {
      db.prepare("DELETE FROM events WHERE user_id=?").run(res.locals.userId);
      saveSettings(db, res.locals.userId, {
        ...getUser(db, res.locals.userId)!.settings,
        enabled: false,
      });
    })();
    res.sendStatus(204);
  });
  app.use("/api", (_req, res) =>
    res.status(404).json({ error: "Метод не найден" }),
  );
  app.use(express.static(resolve("dist")));
  app.get("*", (_req, res) => res.sendFile(resolve("dist/index.html")));
  app.use(
    (
      error: unknown,
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction,
    ) => {
      if (error instanceof z.ZodError)
        res.status(400).json({ error: error.issues[0].message });
      else if (error instanceof Error && /Выберите|Укажите/.test(error.message))
        res.status(400).json({ error: error.message });
      else
        res
          .status(500)
          .json({
            error: "Не удалось выполнить действие. Попробуйте ещё раз.",
          });
    },
  );
  return app;
}
