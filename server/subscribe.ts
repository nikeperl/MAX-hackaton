import "dotenv/config";
import { postMaxJson } from "./max-api.js";
import { maxUpdateTypes } from "./max-events.js";
const { MAX_BOT_TOKEN, MAX_WEBHOOK_SECRET, APP_URL } = process.env;
if (!MAX_BOT_TOKEN || !MAX_WEBHOOK_SECRET || !APP_URL?.startsWith("https://"))
  throw new Error("Нужны MAX_BOT_TOKEN, MAX_WEBHOOK_SECRET и HTTPS APP_URL");
if (!/^[a-zA-Z0-9_-]{16,256}$/.test(MAX_WEBHOOK_SECRET))
  throw new Error(
    "Используйте 16–256 случайных символов A-Z, a-z, 0-9, _ и - для секрета",
  );
const url = new URL("/api/max/webhook", APP_URL);
if (url.port && url.port !== "443")
  throw new Error("MAX требует HTTPS порт 443");
const body = await postMaxJson<{ success: boolean }>(
  `${process.env.MAX_API_URL || "https://platform-api2.max.ru"}/subscriptions`,
  MAX_BOT_TOKEN,
  {
    url: url.toString(),
    secret: MAX_WEBHOOK_SECRET,
    update_types: maxUpdateTypes,
  },
);
if (!body.success) throw new Error("MAX отклонил подписку");
console.log("Webhook подключён:", url.toString());
await postMaxJson(
  `${process.env.MAX_API_URL || "https://platform-api2.max.ru"}/me/commands`,
  MAX_BOT_TOKEN,
  { commands: [] },
  "PATCH",
);
console.log("Меню команд бота обновлено.");
