# Развёртывание в Docker

[Локальный запуск и параметры окружения](../README.md#запуск-через-docker) описаны в README. Здесь — публикация бота и мини-приложения на постоянном сервере.

## Сервер с доменом

Требуются Docker с Compose v2, зарегистрированный бот MAX, домен с DNS-записью на сервер и входящие TCP 80/443. Для Windows и macOS Docker Desktop должен оставаться запущенным; в Windows используется режим Linux containers. На сервере приложение работает в одном экземпляре.

1. Создайте `.env` из [.env.example](../.env.example). Заполните `MAX_BOT_TOKEN`, `MAX_BOT_USERNAME`, `MAX_WEBHOOK_SECRET`, `APP_DOMAIN=app.example.org` и `APP_URL=https://app.example.org`.
2. Секрет webhook можно получить без установленного Node.js:

   ```sh
   docker run --rm node:22-bookworm-slim node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```

3. Запустите API и HTTPS-прокси:

   ```sh
   docker compose -f compose.yaml -f compose.https.yaml up -d --build --wait
   ```

   [Caddyfile](../deploy/https/Caddyfile) проксирует запросы к `app:3001`. Caddy получает и продлевает сертификат автоматически; сертификаты и состояние ACME находятся в томе `caddy-data`. Условия выдачи TLS описаны в [документации Caddy](https://caddyserver.com/docs/automatic-https). Если выпуск сертификата не проходит, проверьте DNS, доступность портов и журнал `caddy`.

4. Укажите `APP_URL` как адрес мини-приложения в настройках бота MAX. Зарегистрируйте webhook:

   ```sh
   docker compose exec -T app node --import tsx server/subscribe.ts
   docker compose exec -T app node --import tsx server/check.ts
   ```

   Первая команда подписывает бота на запуск, остановку, сообщения и `message_callback`, а также убирает старые подсказки команд. Вторая проверяет токен, ник, подписку и публичный HTTPS без отправки сообщений. После изменения адреса или секрета повторите регистрацию.

5. Пройдите [проверку MAX](verification.md#max-чат-и-мини-приложение) и включите напоминания в настройках бота.

Варианты HTTPS взаимоисключающие: `compose.https.yaml` с доменом либо [compose.ip.yaml с публичным IP](windows-ip-hosting.md). Оба прокси занимают порт 443.

## Обновление и остановка

После обновления кода пересоберите приложение:

```sh
docker compose -f compose.yaml -f compose.https.yaml up -d --build --wait
```

Проверка и журнал:

```sh
docker compose -f compose.yaml -f compose.https.yaml ps
docker compose -f compose.yaml -f compose.https.yaml logs --tail 100
```

Остановка с удалением контейнеров и сети:

```sh
docker compose -f compose.yaml -f compose.https.yaml down
```

Повторный запуск — команда `up` выше. Том `app-data` содержит SQLite, `caddy-data` — сертификаты, `caddy-config` — конфигурационное состояние прокси. Обычные `up`, `restart` и `down` сохраняют их. Не используйте `down -v` или очистку томов, если данные нужны. Не меняйте имя рабочего стека `max-hackaton` при обновлении: другое имя создаёт другой набор томов.

## Резервные копии

Перед переносом на другой Docker-хост сохраните `.env` и все именованные тома. Для согласованной файловой копии SQLite предварительно остановите приложение; при копировании работающей базы используйте SQLite backup API. Не копируйте только основной файл активной WAL-базы. В варианте с IP дополнительно сохраняются `deploy/ip/certs/` и `deploy/ip/acme/` на диске.

## Если бот не отвечает

Запустите `server/check.ts` командой выше. Нужны доступный HTTPS 443, совпадение `APP_URL` с webhook и событие `message_callback` в подписке. MAX может удалить подписку после длительной недоступности сервера — в таком случае зарегистрируйте её снова. VPN и firewall должны пропускать исходящие запросы к MAX и входящие запросы к приложению. Проверка транспорта не заменяет получение планового напоминания в реальном чате.
