import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import * as esbuild from "esbuild";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { describe, expect, it } from "vitest";

async function textPdf(lines: string[]): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([612, 792]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  lines.forEach((line, index) => {
    page.drawText(line, { x: 72, y: 720 - index * 28, size: 16, font });
  });
  return pdf.save();
}

describe("bundled pdf reader", () => {
  it("reads resume text after the desktop server bundle", async () => {
    const bytes = await textPdf([
      "Lead Electrician at Acme Corp",
      "City College AAS",
    ]);
    const dir = mkdtempSync(join(tmpdir(), "proforna-pdf-bundle-"));
    const outfile = join(dir, "pdf-read.mjs");
    try {
      await esbuild.build({
        entryPoints: [join(process.cwd(), "server/pdf-read.ts")],
        bundle: true,
        platform: "node",
        format: "esm",
        outfile,
        logLevel: "silent",
      });
      const bundled = (await import(pathToFileURL(outfile).href)) as {
        readPdfText: (data: Uint8Array) => Promise<string>;
      };
      await expect(bundled.readPdfText(bytes)).resolves.toBe(
        "Lead Electrician at Acme Corp\nCity College AAS",
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
