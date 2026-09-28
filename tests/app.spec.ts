import { test, expect } from "@playwright/test";
test("create, reload, complete, parse a document, and save settings", async ({
  page,
}) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(
    page.getByRole("heading", { name: "Всё важное — вовремя" }),
  ).toBeVisible();
  await page
    .locator(".page-heading")
    .getByRole("button", { name: "Добавить событие", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Замена паспорта РФ", exact: false })
    .click();
  await page.getByLabel("Дата рождения").fill("2006-10-20");
  await expect(
    page.getByText("18 января 2027 г.", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Добавить в календарь" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(
    page.getByRole("heading", { name: "Замена паспорта РФ" }),
  ).toBeVisible();
  await page.locator(".upcoming-card").first().click();
  await page.getByRole("button", { name: "Отметить выполненным" }).click();
  await page.getByRole("button", { name: "Выполненные", exact: true }).click();
  await expect(page.locator(".event-row")).toHaveCount(1);
  await page
    .getByRole("button", { name: "Добавить документ", exact: true })
    .click();
  await page.locator("input[type=file]").setInputFiles({
    name: "tax.txt",
    mimeType: "text/plain",
    buffer: Buffer.from(
      "Налоговое уведомление. Срок уплаты 01.12.2026. Дата формирования 10.09.2026.",
    ),
  });
  await expect(page.getByText("Найдено дат: 2")).toBeVisible();
  await page.getByRole("radio").first().check();
  await page
    .getByRole("button", { name: "Проверить и создать событие" })
    .click();
  await expect(page.getByLabel("Дата из налогового уведомления")).toHaveValue(
    "2026-12-01",
  );
  await page.getByRole("button", { name: "Добавить в календарь" }).click();
  await page
    .locator(".sidebar")
    .getByRole("button", { name: "Уведомления", exact: true })
    .click();
  await page
    .getByRole("switch", { name: "Получать напоминания", exact: true })
    .click();
  await page.getByLabel("Часовой пояс").selectOption("Asia/Novosibirsk");
  await page.getByRole("button", { name: "Сохранить настройки" }).click();
  await expect(page.getByRole("status")).toContainText("сохранены");
  await page.reload({ waitUntil: "domcontentloaded" });
  await page
    .locator(".sidebar")
    .getByRole("button", { name: "Уведомления", exact: true })
    .click();
  await expect(
    page.getByRole("switch", { name: "Получать напоминания", exact: true }),
  ).toBeChecked();
  await expect(page.getByLabel("Часовой пояс")).toHaveValue("Asia/Novosibirsk");
});
test("mobile calendar, dialogs and navigation fit the screen", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "Показать примеры" }).click();
  await expect(page.locator(".upcoming-card")).toHaveCount(3);
  await expect
    .poll(() =>
      page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    )
    .toBe(true);
  await page.getByRole("button", { name: "Скрыть сообщение" }).click();
  await page
    .locator(".mobile-nav")
    .getByRole("button", { name: "Календарь", exact: true })
    .click();
  await page.screenshot({ path: "docs/mobile.png", fullPage: false });
  await page.getByRole("button", { name: "Следующий месяц" }).click();
  await page
    .locator(".page-heading")
    .getByRole("button", { name: "Добавить событие", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Флюорография", exact: false })
    .click();
  await page.getByLabel("Дата последнего обследования").fill("2025-09-24");
  await page.getByLabel("Интервал врача").selectOption("12");
  await page.getByRole("button", { name: "Добавить в календарь" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
});
test("desktop screenshot", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "Показать примеры" }).click();
  await expect(page.locator(".upcoming-card")).toHaveCount(3);
  await page.getByRole("button", { name: "Скрыть сообщение" }).click();
  await page
    .locator(".sidebar")
    .getByRole("button", { name: /^Календарь/ })
    .click();
  await page.screenshot({ path: "docs/desktop.png", fullPage: false });
});
