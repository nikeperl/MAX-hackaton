import { test, expect } from "@playwright/test";
function samplePdf() {
  const stream =
    "BT /F1 20 Tf 40 730 Td (Payment deadline: 01.12.2026) Tj 0 -40 Td (Document issued: 10.09.2026) Tj ET";
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((o, i) => {
    offsets.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const start = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  offsets
    .slice(1)
    .forEach(
      (offset) => (pdf += `${String(offset).padStart(10, "0")} 00000 n \n`),
    );
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${start}\n%%EOF`;
  return Buffer.from(pdf);
}
test("extracts dates from a real text PDF", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page
    .getByRole("button", { name: "Добавить документ", exact: true })
    .click();
  await page.locator("input[type=file]").setInputFiles({
    name: "notice.pdf",
    mimeType: "application/pdf",
    buffer: samplePdf(),
  });
  await expect(page.getByText("Найдено дат: 2")).toBeVisible({
    timeout: 30000,
  });
  await page.getByRole("radio").first().check();
  await page
    .getByRole("button", { name: "Проверить и создать событие" })
    .click();
  await expect(page.getByLabel("Крайний срок")).toHaveValue("2026-12-01");
});
test("recognizes a date from image pixels with real OCR", async ({ page }) => {
  test.setTimeout(180000);
  await page.goto("/", { waitUntil: "domcontentloaded" });
  const data = await page.evaluate(() => {
    const c = document.createElement("canvas");
    c.width = 1100;
    c.height = 300;
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = "white";
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.fillStyle = "black";
    ctx.font = "42px Arial";
    ctx.fillText("Document valid until", 40, 100);
    ctx.font = "64px Arial";
    ctx.fillText("24.09.2027", 40, 210);
    return c.toDataURL("image/png").split(",")[1];
  });
  await page
    .getByRole("button", { name: "Добавить документ", exact: true })
    .click();
  await page.locator("input[type=file]").setInputFiles({
    name: "expiry.png",
    mimeType: "image/png",
    buffer: Buffer.from(data, "base64"),
  });
  await expect(page.getByText("Найдено дат: 1")).toBeVisible({
    timeout: 150000,
  });
  await page.getByRole("radio").first().check();
  await page
    .getByRole("button", { name: "Проверить и создать событие" })
    .click();
  await expect(page.getByLabel("Крайний срок")).toHaveValue("2027-09-24");
});
