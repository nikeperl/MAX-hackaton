import { createHmac, timingSafeEqual, createHash } from "node:crypto";
export const hashToken = (s: string) =>
  createHash("sha256").update(s).digest("hex");
export function safeEqual(a: string, b: string) {
  const x = Buffer.from(a),
    y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
export function validateInitData(raw: string, token: string, now = Date.now()) {
  if (!raw || raw.length > 20000 || !token)
    throw new Error("Откройте приложение через MAX");
  const params = new URLSearchParams(raw);
  const keys = [...params.keys()];
  if (new Set(keys).size !== keys.length)
    throw new Error("Повторяющиеся параметры");
  const hash = params.get("hash");
  if (!hash || !/^[a-f0-9]{64}$/i.test(hash))
    throw new Error("Неверная подпись");
  params.delete("hash");
  const data = [...params.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${k}=${v}`)
    .join("\n");
  const secret = createHmac("sha256", "WebAppData").update(token).digest();
  const expected = createHmac("sha256", secret).update(data).digest("hex");
  if (!safeEqual(hash.toLowerCase(), expected))
    throw new Error("Неверная подпись");
  const authDate = Number(params.get("auth_date"));
  if (
    !Number.isFinite(authDate) ||
    authDate <= 0 ||
    now / 1000 - authDate > 3600 ||
    authDate - now / 1000 > 30
  )
    throw new Error("Сессия истекла. Откройте приложение заново");
  const user = JSON.parse(params.get("user") || "null");
  if (!user || !Number.isSafeInteger(user.id) || user.id <= 0)
    throw new Error("Неизвестный пользователь");
  return {
    id: String(user.id),
    name: String(user.first_name || "Пользователь").slice(0, 100),
  };
}
