/**
 * Equipment-manuals text extraction (ADR-0050 β1).
 *
 * Pure capability: bytes-in → markdown + page count out.
 * Caller (`createDocument` enqueue path + the document-processor poller in
 * β1.4) owns when/why; this module owns how.
 *
 * Stack:
 * - PDF → `pdfjs-dist` (already in tree for client-side preview rendering).
 *   We use the legacy build so the same module imports cleanly under Node
 *   (no DOM polyfills needed for headless text extraction).
 * - DOCX → `mammoth` (lightweight, no native deps, returns plain text).
 * - text/* → utf-8 passthrough.
 *
 * Scanned PDFs (no text layer) return `{ markdown: "", pageCount: N }` so
 * the β2 vision-OCR fallback can pick them up by checking
 * `markdown.length < SCANNED_THRESHOLD`.
 */

export type ExtractInput = {
  buffer: Buffer;
  mimeType: string;
};

export type ExtractResult = {
  markdown: string;
  pageCount: number;
};

export const SUPPORTED_EXTRACT_MIMES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
  "text/markdown",
] as const;

const PDF_MIME = "application/pdf";
const DOCX_MIME =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

export function isExtractableMime(mimeType: string): boolean {
  return (
    mimeType === PDF_MIME ||
    mimeType === DOCX_MIME ||
    mimeType.startsWith("text/")
  );
}

export async function extractText(input: ExtractInput): Promise<ExtractResult> {
  const { buffer, mimeType } = input;

  if (mimeType === PDF_MIME) {
    return extractPdf(buffer);
  }
  if (mimeType === DOCX_MIME) {
    return extractDocx(buffer);
  }
  if (mimeType.startsWith("text/")) {
    return { markdown: buffer.toString("utf8"), pageCount: 1 };
  }
  throw new Error(`Unsupported MIME type for extraction: ${mimeType}`);
}

async function extractPdf(buffer: Buffer): Promise<ExtractResult> {
  // Legacy build is the only pdfjs-dist entrypoint that loads cleanly under
  // Node — main build assumes a browser worker context. We pass the bytes as
  // Uint8Array (NOT Buffer) because pdfjs treats Buffer's prototype chain as
  // a foreign typed array on some Node versions.
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const data = new Uint8Array(
    buffer.buffer,
    buffer.byteOffset,
    buffer.byteLength,
  );
  const doc = await pdfjs.getDocument({
    data,
    // Disable font fetching, image rendering, and external resources — we
    // only need the text layer. Saves both perf and the network risk of a
    // malicious PDF reaching out to a CMap CDN.
    disableFontFace: true,
    useSystemFonts: false,
    // `isEvalSupported` is a valid runtime hardening flag on pdfjs's
    // DocumentInitParameters (disables PostScript eval for embedded
    // subroutines — defense-in-depth against malicious PDFs) but it's
    // not exposed on the legacy build's typings. Cast widens just the
    // options literal so we keep the hardening without an `any` escape.
    ...({ isEvalSupported: false } as Record<string, unknown>),
  }).promise;

  const pageCount = doc.numPages;
  const pageTexts: string[] = [];

  for (let pageNum = 1; pageNum <= pageCount; pageNum++) {
    const page = await doc.getPage(pageNum);
    const content = await page.getTextContent();
    const pageText = content.items
      .map((item) => ("str" in item ? item.str : ""))
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
    pageTexts.push(pageText);
    // pdfjs holds rendered resources per page until cleanup is called; we're
    // doing extraction in a long-lived poller (β1.4), so cleanup matters.
    page.cleanup();
  }
  await doc.cleanup();
  await doc.destroy();

  // Page-break markers let β3 chunking attach `pageNumber` metadata to each
  // chunk, which feeds citation rendering in the β4 RAG response envelope.
  // Empty pages are skipped entirely so a fully scanned (no text layer) PDF
  // returns `markdown === ""` — the signal β2's vision-OCR fallback watches
  // for. Markers retain their original (1-based) page number so citations
  // still point at the right page even when earlier pages were empty.
  const parts: string[] = [];
  for (let i = 0; i < pageTexts.length; i++) {
    const text = pageTexts[i];
    if (text.length === 0) continue;
    if (parts.length === 0) {
      parts.push(text);
    } else {
      parts.push(`\n\n<!-- page ${i + 1} -->\n\n${text}`);
    }
  }
  const markdown = parts.join("");

  return { markdown, pageCount };
}

async function extractDocx(buffer: Buffer): Promise<ExtractResult> {
  const mammoth = await import("mammoth");
  const result = await mammoth.extractRawText({ buffer });
  // DOCX has no inherent page break in the document body — Word inserts page
  // breaks at render time. β1 treats every DOCX as 1 "page" for citation
  // anchoring; β3 can revisit if a manual ships paragraph-anchored pages.
  return { markdown: result.value, pageCount: 1 };
}
