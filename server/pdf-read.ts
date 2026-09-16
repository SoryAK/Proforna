import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { linesFromPdfRuns } from "../core/pdf-text";

export async function readPdfText(bytes: Uint8Array): Promise<string> {
  const task = getDocument({
    data: bytes,
    useSystemFonts: true,
    disableFontFace: true,
  });
  const doc = await task.promise;
  const pages: string[] = [];
  try {
    for (let p = 1; p <= doc.numPages; p++) {
      const page = await doc.getPage(p);
      const content = await page.getTextContent();
      const runs = [];
      for (const item of content.items) {
        if (!("str" in item) || !("transform" in item)) continue;
        const transform = item.transform as number[];
        runs.push({
          str: String(item.str),
          x: transform[4] ?? 0,
          y: transform[5] ?? 0,
        });
      }
      pages.push(linesFromPdfRuns(runs));
    }
  } finally {
    await doc.cleanup();
    await task.destroy();
  }
  return pages.filter(Boolean).join("\n").trim();
}
