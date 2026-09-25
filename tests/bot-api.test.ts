import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import type { AddressInfo } from "node:net";
import { createApp } from "../server/app.js";
import { openDatabase } from "../server/db.js";
import { processInbox } from "../server/bot.js";

test("verified MAX session and authenticated webhook share events without duplicating webhook redelivery", async () => {
  const db = openDatabase(":memory:");
  const token = "fake-test-token";
  const server = createApp(db, {
    demo: false,
    production: true,
    token,
    username: "test_bot",
    webhookSecret: "test-secret",
  }).listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
  try {
    const update = {
      update_type: "message_created",
      timestamp: Date.now(),
      message: {
        sender: { user_id: 42, first_name: "Тест" },
        recipient: { chat_type: "dialog" },
        body: { mid: "unique-mid", text: "/add 01.12.2026 Из чата" },
      },
    };
    for (let i = 0; i < 2; i++) {
      const result = await fetch(url + "/max/webhook", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Max-Bot-Api-Secret": "test-secret",
        },
        body: JSON.stringify(update),
      });
      assert.equal(result.status, 200);
    }
    let replies = 0;
    await processInbox(db, async () => {
      replies++;
    });
    assert.equal(replies, 1);
    const params = new URLSearchParams({
      auth_date: String(Math.floor(Date.now() / 1000)),
      user: JSON.stringify({ id: 42, first_name: "Тест" }),
    });
    const data = [...params.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, value]) => `${key}=${value}`)
      .join("\n");
    params.set(
      "hash",
      createHmac(
        "sha256",
        createHmac("sha256", "WebAppData").update(token).digest(),
      )
        .update(data)
        .digest("hex"),
    );
    const login = await fetch(url + "/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ initData: params.toString() }),
    });
    assert.equal(login.status, 200);
    const session = await login.json();
    const headers = {
      Authorization: `Bearer ${session.token}`,
      "Content-Type": "application/json",
    };
    const events = await (await fetch(url + "/events", { headers })).json();
    assert.equal(events.length, 1);
    assert.equal(events[0].title, "Из чата");
    await fetch(url + `/events/${events[0].id}`, {
      method: "PATCH",
      headers,
      body: JSON.stringify({ completed: true }),
    });
    const next = {
      ...update,
      timestamp: Date.now() + 1,
      message: { ...update.message, body: { mid: "next-mid", text: "/next" } },
    };
    await fetch(url + "/max/webhook", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Max-Bot-Api-Secret": "test-secret",
      },
      body: JSON.stringify(next),
    });
    await processInbox(db, async (_id, text) => {
      assert.match(text, /Пока нет событий/);
    });
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    db.close();
  }
});
