import { test } from "node:test";
import assert from "node:assert/strict";
import {
  categories,
  legacyTemplateIds,
  templates,
  templateById,
  resolveTemplateId,
  sortTemplatesForDisplay,
} from "../shared/content.js";
import { eventInputSchema } from "../shared/domain.js";
import {
  createEvent,
  ensureUser,
  listEvents,
  openDatabase,
} from "../server/db.js";

test("catalog has one schema, unique semantic IDs and valid references", () => {
  assert.equal(templates.length, 46);
  assert.equal(
    new Set(templates.map((item) => item.id)).size,
    templates.length,
  );
  assert.equal(
    new Set(templates.map((item) => `${item.category}:${item.title}`)).size,
    templates.length,
  );
  for (const item of templates) {
    assert.match(item.id, /^[a-z]+(?:-[a-z]+)*$/);
    assert.ok(Object.hasOwn(categories, item.category));
    assert.deepEqual(Object.keys(item.details).sort(), [
      "conditions",
      "serviceUrl",
      "source",
    ]);
    if (item.details.source) {
      assert.match(item.details.source.url, /^https:\/\//);
      assert.match(item.details.source.reviewedOn, /^\d{4}-\d{2}-\d{2}$/);
    }
    if (item.details.serviceUrl)
      assert.match(item.details.serviceUrl, /^https:\/\//);
    assert.ok(item.steps.length);
    assert.ok(item.rule.trim());
  }
});

test("display order groups categories and sorts Russian titles without changing catalog order", () => {
  const original = templates.map((item) => item.id);
  const displayed = sortTemplatesForDisplay(templates);
  const categoryOrder = Object.keys(categories);
  assert.deepEqual(
    displayed.map((item) => item.category),
    [...displayed.map((item) => item.category)].sort(
      (a, b) => categoryOrder.indexOf(a) - categoryOrder.indexOf(b),
    ),
  );
  for (const category of categoryOrder) {
    const titles = displayed
      .filter((item) => item.category === category)
      .map((item) => item.title);
    assert.deepEqual(
      titles,
      [...titles].sort(
        new Intl.Collator("ru", { sensitivity: "base" }).compare,
      ),
    );
  }
  assert.deepEqual(
    templates.map((item) => item.id),
    original,
  );
});

test("old workbook IDs still work in input and saved events", () => {
  assert.equal(Object.keys(legacyTemplateIds).length, 40);
  assert.equal(new Set(Object.values(legacyTemplateIds)).size, 40);
  for (const id of Object.values(legacyTemplateIds))
    assert.ok(Object.hasOwn(templateById, id));
  assert.equal(resolveTemplateId("rf-051"), "water-meter-verification");
  assert.equal(resolveTemplateId("rf-092"), "child-allowance");
  assert.equal(resolveTemplateId("missing"), undefined);
  const input = eventInputSchema.parse({
    templateId: "rf-051",
    title: templateById["water-meter-verification"].title,
    category: "other",
    baseDate: "2026-12-01",
  });
  assert.equal(input.templateId, "water-meter-verification");
  assert.equal(input.category, "home");
  const db = openDatabase(":memory:");
  try {
    ensureUser(db, "catalog-user", "Пользователь");
    const saved = createEvent(db, "catalog-user", input);
    db.prepare("UPDATE events SET data=? WHERE id=?").run(
      JSON.stringify({ ...saved, templateId: "rf-051" }),
      saved.id,
    );
    assert.equal(
      listEvents(db, "catalog-user")[0].templateId,
      "water-meter-verification",
    );
  } finally {
    db.close();
  }
});
