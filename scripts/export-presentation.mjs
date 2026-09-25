import { chromium } from "@playwright/test";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  await page.goto(pathToFileURL(resolve("docs/presentation.html")).href);
  await page.evaluate(() => document.fonts.ready);
  const slides = await page.locator(".slide").count();
  await page.pdf({ path: "docs/presentation.pdf", printBackground: true, preferCSSPageSize: true });
  console.log(`PDF exported: ${slides} slides, docs/presentation.pdf`);
} finally {
  await browser.close();
}
