import { chromium } from "@playwright/test";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
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
let version = `Git ${git("rev-parse", "HEAD").trim()}`;

if (options.has("--snapshot")) {
  mkdirSync("submission", { recursive: true });
  mkdirSync(".cache", { recursive: true });
  const files = git(
    "ls-files",
    "-z",
    "--cached",
    "--others",
    "--exclude-standard",
  )
    .split("\0")
    .filter(
      (file) => file && existsSync(file) && file !== "docs/presentation.pdf",
    )
    .filter(
      (file) =>
        !/(^|\/)(?:\.env(?!\.example$)|submission\/|\.cache\/)|\.(?:key|pem|p12|pfx|token|sqlite(?:-wal|-shm)?)$/.test(
          file,
        ),
    );
  const listPath = resolve(".cache/submission-files.txt");
  try {
    writeFileSync(listPath, files.join("\0") + "\0");
    execFileSync("tar", [
      "-czf",
      resolve("submission/source.tar.gz"),
      "--null",
      "-T",
      listPath,
    ]);
  } finally {
    if (existsSync(listPath)) unlinkSync(listPath);
  }
  const digest = createHash("sha256")
    .update(readFileSync("submission/source.tar.gz"))
    .digest("hex");
  writeFileSync("submission/source.sha256", `${digest}  source.tar.gz\n`);
  version = `Архив source.tar.gz · SHA-256 ${digest}`;
} else if (options.has("--use-snapshot")) {
  const digest = createHash("sha256")
    .update(readFileSync("submission/source.tar.gz"))
    .digest("hex");
  version = `Архив source.tar.gz · SHA-256 ${digest}`;
}

const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({
    viewport: { width: 1280, height: 720 },
  });
  await page.goto(pathToFileURL(resolve("docs/presentation.html")).href);
  await page.evaluate(() => document.fonts.ready);
  await page.locator("[data-code-version]").textContent();
  await page.locator("[data-code-version]").evaluate((element, text) => {
    element.textContent = text;
  }, version);
  if (privateExport) {
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
  const output = privateExport
    ? "submission/presentation-private.pdf"
    : "docs/presentation.pdf";
  if (privateExport) mkdirSync("submission", { recursive: true });
  await page.pdf({
    path: output,
    printBackground: true,
    preferCSSPageSize: true,
  });
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
