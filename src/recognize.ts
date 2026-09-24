import { extractDates } from "../shared/domain";
export async function recognize(
  file: File,
  onProgress: (message: string) => void,
) {
  if (file.size > 15 * 1024 * 1024)
    throw new Error("Размер файла должен быть не больше 15 МБ");
  let text = "";
  const ocr = async (image: File | HTMLCanvasElement) => {
    onProgress("Загружаем модуль распознавания…");
    const { createWorker } = await import("tesseract.js");
    const worker = await createWorker("rus+eng", 1, {
      logger: (m) => {
        if (m.status === "recognizing text")
          onProgress(`Распознаём текст · ${Math.round(m.progress * 100)}%`);
      },
    });
    try {
      const r = await worker.recognize(image);
      return r.data.text;
    } finally {
      await worker.terminate();
    }
  };
  if (file.type === "text/plain" || file.name.endsWith(".txt"))
    text = await file.text();
  else if (file.type === "application/pdf" || /\.pdf$/i.test(file.name)) {
    const pdfjs = await import("pdfjs-dist");
    pdfjs.GlobalWorkerOptions.workerSrc = new URL(
      "pdfjs-dist/build/pdf.worker.min.mjs",
      import.meta.url,
    ).toString();
    const doc = await pdfjs.getDocument({
      data: await file.arrayBuffer(),
      isEvalSupported: false,
    }).promise;
    try {
      if (doc.numPages > 5)
        throw new Error(
          "Выберите PDF до 5 страниц или загрузите нужную страницу отдельным файлом",
        );
      for (let i = 1; i <= doc.numPages; i++) {
        onProgress(`Читаем PDF · страница ${i} из ${doc.numPages}`);
        const page = await doc.getPage(i);
        const content = await page.getTextContent();
        const pageText = content.items
          .map((item) => ("str" in item ? item.str : ""))
          .join(" ");
        if (pageText.replace(/\s/g, "").length > 30) text += pageText + "\n";
        else {
          const initial = page.getViewport({ scale: 1 });
          const viewport = page.getViewport({
            scale: Math.min(2, 2200 / Math.max(initial.width, initial.height)),
          });
          const canvas = document.createElement("canvas");
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          const context = canvas.getContext("2d");
          if (!context)
            throw new Error("Браузер не поддерживает распознавание PDF");
          await page.render({ canvasContext: context, viewport }).promise;
          text += (await ocr(canvas)) + "\n";
          canvas.width = 0;
          canvas.height = 0;
        }
      }
    } finally {
      await doc.destroy();
    }
  } else if (["image/jpeg", "image/png", "image/webp"].includes(file.type))
    text = await ocr(file);
  else throw new Error("Поддерживаются JPG, PNG, WebP, PDF и TXT");
  const dates = extractDates(text);
  if (!dates.length)
    throw new Error(
      "Даты не найдены. Попробуйте более чёткое фото или укажите дату вручную.",
    );
  return {
    dates,
    suggested: /флюоро|рентген/i.test(text)
      ? "fluorography"
      : /налог|уплат/i.test(text)
        ? "tax"
        : /загран/i.test(text)
          ? "international"
          : /паспорт|рождения/i.test(text)
            ? "passport"
            : /осаго|страхован/i.test(text)
              ? "insurance"
              : "custom",
  };
}
