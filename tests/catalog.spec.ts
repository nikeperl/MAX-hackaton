import { test, expect } from "@playwright/test";

for (const width of [1440, 390]) {
  test(`catalogue search, spheres and recommendations persist at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await page
      .locator(".page-heading")
      .getByRole("button", { name: "Добавить событие", exact: true })
      .click();
    await expect(page.locator(".template-group-title").first()).toHaveText(
      "Личные документы",
    );
    const firstGroupTitles = await page
      .locator(".template-group-title")
      .first()
      .evaluate((heading) => {
        const titles: string[] = [];
        let item = heading.nextElementSibling;
        while (item?.classList.contains("template-card")) {
          titles.push(item.querySelector("h3")?.textContent ?? "");
          item = item.nextElementSibling;
        }
        return titles;
      });
    expect(firstGroupTitles.length).toBeGreaterThan(1);
    expect(firstGroupTitles).toEqual(
      [...firstGroupTitles].sort(new Intl.Collator("ru").compare),
    );
    await page.getByLabel("Сфера", { exact: true }).selectOption("home");
    await page.getByLabel("Поиск услуги").fill("водосчётчика");
    await expect(page.locator(".template-card")).toHaveCount(1);
    await page.locator(".template-card").click();
    await page.getByLabel("Дата следующей поверки").fill("2026-12-01");
    await page.getByRole("button", { name: "Добавить в календарь" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await page.reload({ waitUntil: "domcontentloaded" });
    await page
      .locator(".upcoming-card")
      .filter({ hasText: "Поверка водосчётчика" })
      .click();
    await expect(page.getByRole("dialog")).toContainText("Аршин");
    await expect(page.getByRole("dialog")).toContainText(
      "Жильё и коммунальные услуги",
    );
    await page.screenshot({
      path: `.cache/catalog-${width}.png`,
      fullPage: true,
    });
    await expect
      .poll(() =>
        page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      )
      .toBe(true);
  });
}
