import "dotenv/config";
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
const response = await fetch(
  `${process.env.MAX_API_URL || "https://platform-api2.max.ru"}/subscriptions`,
  {
    method: "POST",
    headers: {
      Authorization: MAX_BOT_TOKEN,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      url: url.toString(),
      secret: MAX_WEBHOOK_SECRET,
      update_types: ["bot_started", "bot_stopped", "message_created"],
    }),
    signal: AbortSignal.timeout(15000),
  },
);
if (!response.ok) throw new Error(`MAX HTTP ${response.status}`);
const body = (await response.json()) as { success: boolean };
if (!body.success) throw new Error("MAX отклонил подписку");
console.log("Webhook подключён:", url.toString());
