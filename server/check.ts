import "dotenv/config";
import { getMaxApiUrl, postMaxJson } from "./max-api.js";
import { maxUpdateTypes } from "./max-events.js";

// Read-only diagnostic. Never print tokens, webhook secrets or user conversations.
async function checkBot() {
  const token = process.env.MAX_BOT_TOKEN;
  if (!token) throw new Error("MAX_BOT_TOKEN не задан");
  const api = getMaxApiUrl();
  const bot = await postMaxJson<{ username?: string; commands?: unknown[] }>(
    `${api}/me`,
    token,
    null,
    "GET",
  );
  console.log(
    "MAX API: токен принят; бот",
    bot.username,
    "; команд:",
    bot.commands?.length || 0,
  );
  if (bot.username !== process.env.MAX_BOT_USERNAME) {
    console.error(
      "MAX_BOT_USERNAME не совпадает с ником из API. Укажите ник",
      bot.username,
    );
    process.exitCode = 1;
  }
  const subscriptions = await postMaxJson<{
    subscriptions: { url: string; update_types?: string[] }[];
  }>(`${api}/subscriptions`, token, null, "GET");
  const expected = new URL("/api/max/webhook", process.env.APP_URL).toString();
  const active = subscriptions.subscriptions.find(
    (subscription) => subscription.url === expected,
  );
  console.log(
    "Webhook соответствует APP_URL:",
    !!active,
    "; события:",
    active?.update_types?.join(", ") || "все/не заданы",
  );
  const missing = active?.update_types?.length
    ? maxUpdateTypes.filter((type) => !active.update_types!.includes(type))
    : [];
  if (!active || missing.length) process.exitCode = 1;
}
async function checkHttps() {
  if (!process.env.APP_URL?.startsWith("https://"))
    throw new Error("Нужен HTTPS APP_URL");
  const health = await fetch(new URL("/api/health", process.env.APP_URL), {
    signal: AbortSignal.timeout(15000),
  });
  if (!health.ok || (await health.json()).ok !== true)
    throw new Error("Публичный API недоступен");
  console.log("Публичный HTTPS API: доступен.");
}
const checks = await Promise.allSettled([checkBot(), checkHttps()]);
checks.forEach((result, index) => {
  if (result.status === "rejected") {
    console.error(
      `${index === 0 ? "MAX" : "HTTPS"}: проверка не пройдена (${result.reason instanceof Error ? result.reason.message : "ошибка соединения"}).`,
    );
    process.exitCode = 1;
  }
});
console.log(
  "Реальную доставку проверьте кнопкой «Тестовое уведомление» и сценарием расписания в docs/verification.md.",
);
