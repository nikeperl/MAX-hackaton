import "dotenv/config";
import { openDatabase } from "./db.js";
import { createApp } from "./app.js";
import { maxSender, processInbox, processReminders } from "./bot.js";
import { postMaxJson } from "./max-api.js";
const production = process.env.NODE_ENV === "production";
const demo =
  process.env.DEMO_MODE === "true" ||
  (!production &&
    process.env.DEMO_MODE !== "false" &&
    !process.env.MAX_BOT_TOKEN);
const token = process.env.MAX_BOT_TOKEN || "",
  username = process.env.MAX_BOT_USERNAME || "",
  webhookSecret = process.env.MAX_WEBHOOK_SECRET || "";
if (production && demo)
  throw new Error("В production DEMO_MODE должен быть false");
if (!demo && (!token || !username || !webhookSecret))
  throw new Error(
    "Заполните MAX_BOT_TOKEN, MAX_BOT_USERNAME, MAX_WEBHOOK_SECRET в .env",
  );
const db = openDatabase(process.env.DATABASE_PATH || "./data/vovremya.sqlite");
const app = createApp(db, {
  production,
  demo,
  token,
  username,
  webhookSecret,
  onUpdate: () => setImmediate(() => void tick()),
  onCallback: (id) => {
    void postMaxJson<{ success: boolean }>(
      `${process.env.MAX_API_URL || "https://platform-api2.max.ru"}/answers?callback_id=${encodeURIComponent(id)}`,
      token,
      {},
    )
      .then((answer) => {
        if (!answer.success) console.error("MAX не подтвердил нажатие кнопки.");
      })
      .catch(() => console.error("Не удалось подтвердить нажатие кнопки MAX."));
  },
});
const server = app.listen(Number(process.env.PORT || 3001), () =>
  console.log(
    `Вовремя: http://localhost:${process.env.PORT || 3001} · ${demo ? "локальное демо" : "MAX"}`,
  ),
);
const send = maxSender(token, process.env.MAX_API_URL);
let busy = false;
const tick = async () => {
  if (busy || demo) return;
  busy = true;
  try {
    await processInbox(db, send);
    await processReminders(db, send);
  } catch {
    console.error(
      "Ошибка фоновой обработки; следующая попытка через 15 секунд.",
    );
  } finally {
    busy = false;
  }
};
const timer = setInterval(tick, 15000);
void tick();
process.on("SIGTERM", () => {
  clearInterval(timer);
  server.close(() => {
    db.close();
    process.exit(0);
  });
});
