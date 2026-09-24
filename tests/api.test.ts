import { test } from "node:test";
import assert from "node:assert/strict";
import { createApp } from "../server/app.js";
import { openDatabase } from "../server/db.js";
import type { AddressInfo } from "node:net";
test("API isolates users, persists events, rejects spoofed webhooks and disables demo login in live mode", async () => {
  const db = openDatabase(":memory:");
  const app = createApp(db, {
    demo: true,
    token: "",
    username: "",
    webhookSecret: "secret-test",
    production: false,
  });
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const req = async (
    path: string,
    method = "GET",
    body?: unknown,
    token?: string,
  ) =>
    fetch(url + "/api" + path, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  try {
    const a = await (await req("/session", "POST", {})).json();
    const b = await (await req("/session", "POST", {})).json();
    assert.notEqual(a.user.id, b.user.id);
    assert.equal((await req("/events")).status, 401);
    const created = await req(
      "/events",
      "POST",
      {
        templateId: "custom",
        title: "Проверка",
        category: "other",
        baseDate: "2026-12-01",
        reminders: [7],
      },
      a.token,
    );
    assert.equal(created.status, 201);
    const event = await created.json();
    assert.equal(
      (await (await req("/events", "GET", undefined, a.token)).json()).length,
      1,
    );
    assert.equal(
      (await (await req("/events", "GET", undefined, b.token)).json()).length,
      0,
    );
    assert.equal(
      (await req("/events/" + event.id, "DELETE", undefined, b.token)).status,
      404,
    );
    assert.equal(
      (await req("/events/" + event.id, "PATCH", { completed: true }, b.token))
        .status,
      404,
    );
    const editedInput = {
      templateId: "passport",
      title: "Паспорт",
      category: "documents",
      baseDate: "2006-10-20",
      age: 20,
      reminders: [7],
    };
    assert.equal(
      (await req("/events/" + event.id, "PUT", editedInput, b.token)).status,
      404,
    );
    const edited = await (
      await req("/events/" + event.id, "PUT", editedInput, a.token)
    ).json();
    assert.equal(edited.dueDate, "2027-01-18");
    assert.equal(edited.milestoneDate, "2026-10-20");
    const generic = await (
      await req(
        "/events/" + event.id,
        "PUT",
        {
          templateId: "custom",
          title: "Событие",
          category: "other",
          baseDate: "2027-01-01",
        },
        a.token,
      )
    ).json();
    assert.equal(generic.milestoneDate, undefined);
    assert.equal(
      (await req("/max/webhook", "POST", { update_type: "bot_started" }))
        .status,
      403,
    );
    assert.equal(
      (
        await req(
          "/events",
          "POST",
          {
            templateId: "custom",
            title: "bad",
            category: "other",
            baseDate: "2026-02-30",
          },
          a.token,
        )
      ).status,
      400,
    );
    assert.equal(
      (await req("/events/" + event.id, "PATCH", { completed: true }, a.token))
        .status,
      200,
    );
    assert.equal(
      (await req("/data", "DELETE", undefined, a.token)).status,
      204,
    );
    assert.equal(
      (await (await req("/events", "GET", undefined, a.token)).json()).length,
      0,
    );
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    db.close();
  }
  const liveDb = openDatabase(":memory:");
  const live = createApp(liveDb, {
    demo: false,
    token: "test",
    username: "bot",
    webhookSecret: "secret",
    production: true,
  }).listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => live.once("listening", resolve));
  try {
    const r = await fetch(
      `http://127.0.0.1:${(live.address() as AddressInfo).port}/api/session`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      },
    );
    assert.equal(r.status, 401);
  } finally {
    await new Promise<void>((resolve) => live.close(() => resolve()));
    liveDb.close();
  }
});
