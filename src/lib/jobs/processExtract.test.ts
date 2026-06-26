import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    document: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  },
}));

vi.mock("@/lib/documents/storage", () => ({
  readDocumentBytes: vi.fn(),
}));

vi.mock("@/lib/manuals/extract", () => ({
  extractText: vi.fn(),
  isExtractableMime: vi.fn(),
}));

vi.mock("./complete", () => ({
  markJobSucceeded: vi.fn(),
  markJobFailed: vi.fn(),
}));

import { prisma } from "@/lib/prisma";
import { readDocumentBytes } from "@/lib/documents/storage";
import { extractText, isExtractableMime } from "@/lib/manuals/extract";
import { markJobSucceeded, markJobFailed } from "./complete";
import { processExtract } from "./processExtract";
import type { ClaimedJob } from "./claim";

const mockFindUnique = vi.mocked(prisma.document.findUnique) as unknown as ReturnType<
  typeof vi.fn
>;
const mockUpdate = vi.mocked(prisma.document.update) as unknown as ReturnType<
  typeof vi.fn
>;
const mockReadBytes = vi.mocked(readDocumentBytes) as unknown as ReturnType<
  typeof vi.fn
>;
const mockExtract = vi.mocked(extractText) as unknown as ReturnType<typeof vi.fn>;
const mockIsExtractable = vi.mocked(isExtractableMime) as unknown as ReturnType<
  typeof vi.fn
>;
const mockMarkSucceeded = vi.mocked(markJobSucceeded) as unknown as ReturnType<
  typeof vi.fn
>;
const mockMarkFailed = vi.mocked(markJobFailed) as unknown as ReturnType<
  typeof vi.fn
>;

function claimedJob(overrides: Partial<ClaimedJob> = {}): ClaimedJob {
  return {
    id: "job-1",
    documentId: "doc-1",
    kind: "extract",
    status: "running",
    attempts: 1,
    maxAttempts: 5,
    scheduledFor: new Date(),
    claimedAt: new Date(),
    completedAt: null,
    lastError: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe("processExtract", () => {
  beforeEach(() => {
    mockFindUnique.mockReset();
    mockUpdate.mockReset();
    mockReadBytes.mockReset();
    mockExtract.mockReset();
    mockIsExtractable.mockReset();
    mockMarkSucceeded.mockReset();
    mockMarkFailed.mockReset();
    mockUpdate.mockResolvedValue({});
    mockMarkSucceeded.mockResolvedValue(undefined);
    mockMarkFailed.mockResolvedValue(undefined);
  });

  it("happy path: extracts text, stamps Document.ready, calls markJobSucceeded", async () => {
    mockFindUnique.mockResolvedValue({
      id: "doc-1",
      mimeType: "application/pdf",
      filePath: "/tmp/doc-1.pdf",
      data: null,
    });
    mockIsExtractable.mockReturnValue(true);
    mockReadBytes.mockResolvedValue(Buffer.from("PDFBYTES"));
    mockExtract.mockResolvedValue({
      markdown: "Equipment manual content",
      pageCount: 3,
    });

    await processExtract(claimedJob());

    expect(mockExtract).toHaveBeenCalledWith({
      buffer: Buffer.from("PDFBYTES"),
      mimeType: "application/pdf",
    });
    expect(mockUpdate).toHaveBeenCalledTimes(1);
    const updateArgs = mockUpdate.mock.calls[0][0] as {
      where: { id: string };
      data: Record<string, unknown>;
    };
    expect(updateArgs.where).toEqual({ id: "doc-1" });
    expect(updateArgs.data.markdownContent).toBe("Equipment manual content");
    expect(updateArgs.data.pageCount).toBe(3);
    expect(updateArgs.data.processingStatus).toBe("ready");
    expect(updateArgs.data.extractionError).toBeNull();
    expect(updateArgs.data.processedAt).toBeInstanceOf(Date);

    expect(mockMarkSucceeded).toHaveBeenCalledWith("job-1");
    expect(mockMarkFailed).not.toHaveBeenCalled();
  });

  it("scanned-PDF path: empty markdown → Document.skipped, but JOB still succeeded", async () => {
    mockFindUnique.mockResolvedValue({
      id: "doc-1",
      mimeType: "application/pdf",
      filePath: "/tmp/scan.pdf",
      data: null,
    });
    mockIsExtractable.mockReturnValue(true);
    mockReadBytes.mockResolvedValue(Buffer.from("SCAN"));
    mockExtract.mockResolvedValue({ markdown: "", pageCount: 5 });

    await processExtract(claimedJob());

    const updateArgs = mockUpdate.mock.calls[0][0] as {
      data: { processingStatus: string; markdownContent: string };
    };
    expect(updateArgs.data.processingStatus).toBe("skipped");
    expect(updateArgs.data.markdownContent).toBe("");
    // Retrying the same extract path would re-produce empty — succeed,
    // don't retry.
    expect(mockMarkSucceeded).toHaveBeenCalledWith("job-1");
    expect(mockMarkFailed).not.toHaveBeenCalled();
  });

  it("Document missing: calls markJobFailed with a descriptive message", async () => {
    mockFindUnique.mockResolvedValue(null);

    await processExtract(claimedJob({ documentId: "missing-doc" }));

    expect(mockUpdate).not.toHaveBeenCalled();
    expect(mockMarkSucceeded).not.toHaveBeenCalled();
    expect(mockMarkFailed).toHaveBeenCalledTimes(1);
    const [jobId, errMsg] = mockMarkFailed.mock.calls[0];
    expect(jobId).toBe("job-1");
    expect(errMsg).toMatch(/missing-doc/);
    expect(errMsg).toMatch(/not found/i);
  });

  it("Unsupported MIME (defense): marks job failed, doesn't touch Document", async () => {
    mockFindUnique.mockResolvedValue({
      id: "doc-1",
      mimeType: "image/png",
      filePath: "/tmp/x.png",
      data: null,
    });
    mockIsExtractable.mockReturnValue(false);

    await processExtract(claimedJob());

    expect(mockUpdate).not.toHaveBeenCalled();
    expect(mockMarkFailed).toHaveBeenCalledTimes(1);
    expect(mockMarkFailed.mock.calls[0][1]).toMatch(/image\/png/);
    expect(mockMarkFailed.mock.calls[0][1]).toMatch(/not extractable/i);
  });

  it("extractText throws: catches, calls markJobFailed with the thrown message", async () => {
    mockFindUnique.mockResolvedValue({
      id: "doc-1",
      mimeType: "application/pdf",
      filePath: "/tmp/corrupt.pdf",
      data: null,
    });
    mockIsExtractable.mockReturnValue(true);
    mockReadBytes.mockResolvedValue(Buffer.from("CORRUPT"));
    mockExtract.mockRejectedValue(new Error("pdfjs: invalid xref"));

    await processExtract(claimedJob());

    expect(mockMarkSucceeded).not.toHaveBeenCalled();
    expect(mockMarkFailed).toHaveBeenCalledTimes(1);
    expect(mockMarkFailed.mock.calls[0][1]).toBe("pdfjs: invalid xref");
  });
});
