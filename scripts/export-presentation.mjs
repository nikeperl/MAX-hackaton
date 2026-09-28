import { chromium } from "@playwright/test";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { copyFileSync, mkdirSync, readFileSync } from 'node:fs';
import { execFileSync } from "node:child_process";
import { parse } from "dotenv";

const options = new Set(process.argv.slice(2));
const privateExport = options.has("--private");
if (privateExport && options.has("--previews"))
  throw new Error("Previews are only available for the public presentation");
const git = (...args) =>
  execFileSync(
    "git",
    ["-c", `safe.directory=${resolve(".").replaceAll("\\", "/")}`, ...args],
    { encoding: "utf8" },
  );
const version = privateExport ? `Git commit ${git('rev-parse', 'HEAD').trim()}` : '';

const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({
    viewport: { width: 1280, height: 720 },
  });
  await page.goto(pathToFileURL(resolve(privateExport ? "docs/.private-presentation.html" : "docs/presentation.html")).href);
  await page.evaluate(() => document.fonts.ready);
  await page.emulateMedia({ media: 'print' });
  if (privateExport) {
    await page.locator("[data-code-version]").evaluate((element, text) => {
      element.textContent = text;
    }, version);
    const config = parse(readFileSync(".env", "utf8"));
    const required = [
      "MAX_BOT_TOKEN",
      "MAX_WEBHOOK_SECRET",
      "MAX_BOT_USERNAME",
      "APP_URL",
    ];
    if (required.some((key) => !config[key]))
      throw new Error("Required MAX settings are missing from .env");
    const entries = [...required, "MAX_API_URL", "APP_DOMAIN", "PUBLIC_IP"]
      .filter((key) => config[key])
      .map((key) => [key, config[key]]);
    entries.push(['NODE_ENV', 'production'], ['DEMO_MODE', 'false'], ['PORT', '3001'], ['DATABASE_PATH', '/app/data/vovremya.sqlite']);
    await page.locator('[data-access-title]').textContent();
    await page.locator('[data-access-title]').evaluate(el => { el.textContent = 'ЗАКРЫТЫЙ ЭКЗЕМПЛЯР ДЛЯ ЖЮРИ · РАБОЧИЕ ПАРАМЕТРЫ · НЕ ПУБЛИКОВАТЬ'; });
    await page.locator("[data-private-access]").evaluate((element, entries) => {
      element.className = "access-settings";
      element.replaceChildren(
        ...entries.map(([key, value]) => {
          const row = document.createElement("p");
          const label = document.createElement("b");
          label.textContent = `${key}: `;
          const text = document.createElement("code");
          text.textContent = value;
          row.append(label, text);
          return row;
        }),
      );
    }, entries);
  }
  const missingImages = await page
    .locator("img")
    .evaluateAll((items) =>
      items
        .filter((item) => !item.complete || !item.naturalWidth)
        .map((item) => item.getAttribute("src")),
    );
  if (missingImages.length)
    throw new Error(`Missing images: ${missingImages.join(", ")}`);
  const slides = page.locator(".slide");
  const count = await slides.count();
  const overflow = await slides.evaluateAll((items) =>
    items.flatMap((item, index) =>
      item.scrollHeight > item.clientHeight + 1 ? [index + 1] : [],
    ),
  );
  if (overflow.length)
    throw new Error(`Slides overflow: ${overflow.join(", ")}`);
  const layoutProblems = await slides.evaluateAll(items => items.flatMap((item, index) => {
    const content = item.querySelector('.content');
    const footer = item.querySelector('footer').getBoundingClientRect();
    const header = item.querySelector('header');
    const problems = [];
    if (header && header.getBoundingClientRect().bottom > content.getBoundingClientRect().top - 12) problems.push('header/content');
    if (content) for (const el of content.querySelectorAll('p,h3,td,img,.result,.note,.access-box')) {
      const box = el.getBoundingClientRect();
      if (box.bottom > footer.top - 8) problems.push(el.tagName + ': footer overlap');
      if (box.right > item.getBoundingClientRect().right - 40) problems.push(el.tagName + ': horizontal overflow');
    }
    return problems.length ? [`${index+1}: ${[...new Set(problems)].join(', ')}`] : [];
  }));
  if (layoutProblems.length) throw new Error(`Layout problems: ${layoutProblems.join('; ')}`);
  const output = privateExport
    ? "submission/presentation-private.pdf"
    : "docs/presentation.pdf";
  if (privateExport) mkdirSync("submission", { recursive: true });
  await page.pdf({
    path: output,
    printBackground: true,
    preferCSSPageSize: true,
  });
  if (!privateExport) copyFileSync(output, 'presentation.pdf');
  if (options.has("--previews")) {
    mkdirSync(".cache/presentation", { recursive: true });
    for (let i = 0; i < count; i++)
      await slides
        .nth(i)
        .screenshot({
          path: `.cache/presentation/slide-${String(i + 1).padStart(2, "0")}.png`,
        });
  }
  console.log(`PDF exported: ${count} slides, ${output}`);
} finally {
  await browser.close();
}
