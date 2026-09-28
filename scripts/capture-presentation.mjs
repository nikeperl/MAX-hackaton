import { chromium, expect } from '@playwright/test';
import { spawn } from 'node:child_process';
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import ts from 'typescript';

// Isolated, synthetic demo. No MAX transport or working database is used.
for (const dir of ['server', 'shared']) {
  mkdirSync(`.cache/test-runtime/${dir}`, { recursive: true });
  for (const file of readdirSync(dir).filter(name => name.endsWith('.ts'))) {
    const output = ts.transpileModule(readFileSync(`${dir}/${file}`, 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
    writeFileSync(`.cache/test-runtime/${dir}/${file.replace(/\.ts$/, '.js')}`, output);
  }
}
const server = spawn(process.execPath, ['.cache/test-runtime/server/index.js'], {
  windowsHide: true,
  env: { ...process.env, NODE_ENV: 'development', DEMO_MODE: 'true', MAX_BOT_TOKEN: '', MAX_BOT_USERNAME: '', MAX_WEBHOOK_SECRET: '', PORT: '3017', DATABASE_PATH: ':memory:' },
  stdio: 'ignore',
});
let browser;
try {
  for (let i = 0; i < 40; i++) {
    try { if ((await fetch('http://127.0.0.1:3017/api/health')).ok) break; } catch {}
    await new Promise(r => setTimeout(r, 250));
  }
  mkdirSync('docs/presentation-assets', { recursive: true });
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1100, height: 1000 }, deviceScaleFactor: 1.5 });
  await page.goto('http://127.0.0.1:3017');
  await page.addStyleTag({content:'[role="dialog"]{border-radius:0!important;box-shadow:none!important;background:#fff!important;overflow:hidden!important}'});
  await page.locator('.page-heading').getByRole('button', { name: 'Добавить событие', exact: true }).click();
  await page.getByRole('button', { name: 'Замена паспорта РФ', exact: false }).click();
  await page.getByLabel('Дата рождения').fill('2006-10-20');
  await expect(page.getByText('18 января 2027 г.', { exact: true })).toBeVisible();
  await page.getByLabel('Дата рождения').evaluate(el => el.blur());
  await page.getByRole('dialog').screenshot({ path: 'docs/presentation-assets/create.png' });
  await page.getByRole('button', { name: 'Добавить в календарь' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.locator('.upcoming-card').first().click();
  await page.getByRole('dialog').screenshot({ path: 'docs/presentation-assets/detail.png' });
  await page.keyboard.press('Escape');
  if (await page.getByRole('dialog').count()) await page.getByRole('button', { name: 'Закрыть', exact: true }).click();
  await page.getByRole('button', { name: 'Добавить документ', exact: true }).click();
  await page.locator('input[type=file]').setInputFiles({ name: 'example.txt', mimeType: 'text/plain', buffer: Buffer.from('Налоговое уведомление. Срок уплаты 01.12.2026. Дата формирования 10.09.2026.') });
  await expect(page.getByText('Найдено дат: 2')).toBeVisible();
  await page.getByRole('radio').first().check();
  await page.getByRole('dialog').screenshot({ path: 'docs/presentation-assets/import.png' });
  await page.locator('input[type=file]').setInputFiles({ name: 'example.exe', mimeType: 'application/octet-stream', buffer: Buffer.from('synthetic invalid file') });
  await expect(page.getByRole('alert')).toBeVisible();
  await page.getByRole('dialog').screenshot({ path: 'docs/presentation-assets/error.png' });
  console.log('Captured 4 real UI states using synthetic data.');
} finally {
  await browser?.close();
  server.kill();
}
