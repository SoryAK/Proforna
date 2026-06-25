import { describe, it, expect, beforeAll } from "vitest";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { Document, Packer, Paragraph, TextRun } from "docx";
import {
  extractText,
  isExtractableMime,
  SUPPORTED_EXTRACT_MIMES,
} from "./extract";

/**
 * Fixtures are generated in-memory at suite startup. No binary blobs in git;
 * pdf-lib + docx are devDeps used only here. This keeps tests deterministic
 * and reviewable while sidestepping the "minimal hand-crafted PDF" rabbit
 * hole (xref byte offsets, font dictionaries, etc.).
 */

const PDF_MIME = "application/pdf";
const DOCX_MIME =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

const PDF_SINGLE_PAGE_TEXT = "Equipment torque spec: 45 Nm";
const PDF_MULTI_PAGE_TEXTS = [
  "Page one introduction",
  "Page two procedures",
  "Page three appendix",
];
const DOCX_TEXT = "Hydraulic pump maintenance interval: 500 hours";
const PLAIN_TEXT = "Plain manual text\nwith two lines";

let pdfSinglePage: Buffer;
let pdfMultiPage: Buffer;
let pdfNoText: Buffer;
let docxFile: Buffer;

async function buildPdf(pageTexts: string[]): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (const text of pageTexts) {
    const page = doc.addPage([612, 792]);
    page.drawText(text, { x: 50, y: 700, size: 14, font });
  }
  const bytes = await doc.save();
  return Buffer.from(bytes);
}

async function buildEmptyPdf(pageCount: number): Promise<Buffer> {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pageCount; i++) {
    doc.addPage([612, 792]);
  }
  const bytes = await doc.save();
  return Buffer.from(bytes);
}

async function buildDocx(text: string): Promise<Buffer> {
  const doc = new Document({
    sections: [
      {
        properties: {},
        children: [new Paragraph({ children: [new TextRun(text)] })],
      },
    ],
  });
  return Packer.toBuffer(doc);
}

describe("extractText", () => {
  beforeAll(async () => {
    [pdfSinglePage, pdfMultiPage, pdfNoText, docxFile] = await Promise.all([
      buildPdf([PDF_SINGLE_PAGE_TEXT]),
      buildPdf(PDF_MULTI_PAGE_TEXTS),
      buildEmptyPdf(2),
      buildDocx(DOCX_TEXT),
    ]);
  });

  it("passes through text/plain content as utf-8", async () => {
    const result = await extractText({
      buffer: Buffer.from(PLAIN_TEXT, "utf8"),
      mimeType: "text/plain",
    });
    expect(result.markdown).toBe(PLAIN_TEXT);
    expect(result.pageCount).toBe(1);
  });

  it("passes through text/markdown content as utf-8", async () => {
    const md = "# Manual\n\n- step 1\n- step 2";
    const result = await extractText({
      buffer: Buffer.from(md, "utf8"),
      mimeType: "text/markdown",
    });
    expect(result.markdown).toBe(md);
    expect(result.pageCount).toBe(1);
  });

  it("extracts text from a single-page PDF", async () => {
    const result = await extractText({
      buffer: pdfSinglePage,
      mimeType: PDF_MIME,
    });
    expect(result.pageCount).toBe(1);
    expect(result.markdown).toContain(PDF_SINGLE_PAGE_TEXT);
  });

  it("extracts text from a multi-page PDF with page break markers", async () => {
    const result = await extractText({
      buffer: pdfMultiPage,
      mimeType: PDF_MIME,
    });
    expect(result.pageCount).toBe(PDF_MULTI_PAGE_TEXTS.length);
    for (const text of PDF_MULTI_PAGE_TEXTS) {
      expect(result.markdown).toContain(text);
    }
    // Page boundaries must be discoverable downstream so chunking (β3) can
    // attach `pageNumber` metadata to each chunk for citation rendering.
    expect(result.markdown).toMatch(/<!-- page 2 -->/);
    expect(result.markdown).toMatch(/<!-- page 3 -->/);
  });

  it("returns empty markdown for a PDF with no extractable text (scanned-like)", async () => {
    // The β2 vision-OCR fallback recognizes this case via markdown.length and
    // re-enqueues an `ocr-page` job. β1 just hands back the empty signal.
    const result = await extractText({
      buffer: pdfNoText,
      mimeType: PDF_MIME,
    });
    expect(result.pageCount).toBe(2);
    expect(result.markdown.trim()).toBe("");
  });

  it("extracts text from a DOCX file", async () => {
    const result = await extractText({
      buffer: docxFile,
      mimeType: DOCX_MIME,
    });
    expect(result.markdown).toContain(DOCX_TEXT);
    expect(result.pageCount).toBe(1);
  });

  it("throws on unsupported MIME type", async () => {
    await expect(
      extractText({
        buffer: Buffer.from([0x00, 0x01]),
        mimeType: "application/octet-stream",
      }),
    ).rejects.toThrow(/unsupported/i);
  });
});

describe("isExtractableMime", () => {
  it("returns true for all SUPPORTED_EXTRACT_MIMES entries", () => {
    for (const mime of SUPPORTED_EXTRACT_MIMES) {
      expect(isExtractableMime(mime)).toBe(true);
    }
  });

  it("returns true for any text/* MIME type", () => {
    expect(isExtractableMime("text/csv")).toBe(true);
    expect(isExtractableMime("text/html")).toBe(true);
  });

  it("returns false for unsupported MIME types", () => {
    expect(isExtractableMime("application/octet-stream")).toBe(false);
    expect(isExtractableMime("image/png")).toBe(false);
    expect(isExtractableMime("application/zip")).toBe(false);
  });
});
