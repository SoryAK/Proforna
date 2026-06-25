import { describe, it, expect, vi, beforeEach } from "vitest";
import { promises as fs } from "fs";
import path from "path";
import os from "os";
import {
  attachDocument,
  getAssetDocumentFile,
  VALID_DOC_TYPES,
} from "./asset-document";

// Schema-faithful mocks (ADR 2026-06-22): only delegates we exercise.
vi.mock("@/lib/prisma", () => ({
  prisma: {
    assetDocument: {
      create: vi.fn(),
      findUnique: vi.fn(),
    },
  },
}));

// Mock readDocumentBytes so the documentId branch is isolated from real disk.
// Other branches (legacy filePath, url-only) don't touch this dep.
vi.mock("./storage", () => ({
  readDocumentBytes: vi.fn(),
}));

import { prisma } from "@/lib/prisma";
import { readDocumentBytes } from "./storage";

const mockCreate = vi.mocked(prisma.assetDocument.create) as unknown as ReturnType<
  typeof vi.fn
>;
const mockFindUnique = vi.mocked(prisma.assetDocument.findUnique) as unknown as ReturnType<
  typeof vi.fn
>;
const mockReadBytes = vi.mocked(readDocumentBytes);

beforeEach(() => {
  mockCreate.mockReset();
  mockFindUnique.mockReset();
  mockReadBytes.mockReset();
});

describe("attachDocument", () => {
  it("creates AssetDocument linking to AssetType via connect form", async () => {
    mockCreate.mockResolvedValue({ id: "ad-1" });
    await attachDocument({
      assetTypeId: "at-1",
      documentId: "doc-1",
      title: "Pump Manual",
      docType: "manual",
    });
    expect(mockCreate).toHaveBeenCalledTimes(1);
    const arg = mockCreate.mock.calls[0][0];
    expect(arg.data.assetType).toEqual({ connect: { id: "at-1" } });
    expect(arg.data.asset).toBeUndefined();
    expect(arg.data.document).toEqual({ connect: { id: "doc-1" } });
    expect(arg.data.docType).toBe("manual");
    expect(arg.data.title).toBe("Pump Manual");
  });

  it("creates AssetDocument linking to JobAsset via connect form", async () => {
    mockCreate.mockResolvedValue({ id: "ad-2" });
    await attachDocument({
      assetId: "ja-1",
      documentId: "doc-2",
      title: "Site wiring",
      docType: "wiring_diagram",
    });
    const arg = mockCreate.mock.calls[0][0];
    expect(arg.data.asset).toEqual({ connect: { id: "ja-1" } });
    expect(arg.data.assetType).toBeUndefined();
    expect(arg.data.docType).toBe("wiring_diagram");
  });

  it("throws when both assetTypeId and assetId are provided", async () => {
    await expect(
      attachDocument({
        assetTypeId: "at-1",
        assetId: "ja-1",
        documentId: "doc-1",
        title: "x",
      }),
    ).rejects.toThrow(/exactly one/i);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("throws when neither assetTypeId nor assetId is provided", async () => {
    await expect(
      attachDocument({
        documentId: "doc-1",
        title: "x",
      }),
    ).rejects.toThrow(/exactly one/i);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("coerces unknown docType to 'other'", async () => {
    mockCreate.mockResolvedValue({ id: "ad-3" });
    await attachDocument({
      assetTypeId: "at-1",
      documentId: "doc-1",
      title: "x",
      docType: "totally-bogus",
    });
    expect(mockCreate.mock.calls[0][0].data.docType).toBe("other");
  });

  it("defaults docType to 'other' when omitted", async () => {
    mockCreate.mockResolvedValue({ id: "ad-4" });
    await attachDocument({
      assetTypeId: "at-1",
      documentId: "doc-1",
      title: "x",
    });
    expect(mockCreate.mock.calls[0][0].data.docType).toBe("other");
  });

  it("trims and slices title to 200 chars", async () => {
    mockCreate.mockResolvedValue({ id: "ad-5" });
    const longTitle = "  " + "a".repeat(250) + "  ";
    await attachDocument({
      assetTypeId: "at-1",
      documentId: "doc-1",
      title: longTitle,
    });
    const written = mockCreate.mock.calls[0][0].data.title as string;
    expect(written.length).toBe(200);
    expect(written.startsWith("a")).toBe(true);
  });

  it("exposes a complete VALID_DOC_TYPES set", () => {
    expect(VALID_DOC_TYPES.has("manual")).toBe(true);
    expect(VALID_DOC_TYPES.has("wiring_diagram")).toBe(true);
    expect(VALID_DOC_TYPES.has("spec_sheet")).toBe(true);
    expect(VALID_DOC_TYPES.has("safety_sheet")).toBe(true);
    expect(VALID_DOC_TYPES.has("parts_list")).toBe(true);
    expect(VALID_DOC_TYPES.has("other")).toBe(true);
    expect(VALID_DOC_TYPES.has("not-a-type")).toBe(false);
  });
});

describe("getAssetDocumentFile", () => {
  it("returns bytes via readDocumentBytes when documentId is linked", async () => {
    const linkedDoc = {
      id: "doc-1",
      mimeType: "application/pdf",
      fileName: "manual.pdf",
      filePath: "/some/path/manual.pdf",
      data: null,
    };
    mockFindUnique.mockResolvedValue({
      id: "ad-1",
      assetTypeId: "at-1",
      assetId: null,
      documentId: "doc-1",
      filePath: null,
      url: null,
      document: linkedDoc,
    });
    mockReadBytes.mockResolvedValue(Buffer.from("manual contents"));

    const result = await getAssetDocumentFile("ad-1");

    expect(mockReadBytes).toHaveBeenCalledWith(linkedDoc);
    expect(result.mimeType).toBe("application/pdf");
    expect(result.fileName).toBe("manual.pdf");
    expect(result.bytes.toString()).toBe("manual contents");
  });

  it("reads legacy filePath under LEGACY_FILE_ROOT (public/uploads)", async () => {
    // Place a real file under <repo>/public/uploads/_test/ and point AssetDocument
    // at it. Cleanup in finally.
    const legacyDir = path.join(process.cwd(), "public", "uploads", "_asset_doc_test");
    const fileName = `legacy-${Date.now()}.pdf`;
    const filePath = path.join(legacyDir, fileName);
    const bytes = Buffer.from("%PDF-1.4 legacy bytes\n");
    await fs.mkdir(legacyDir, { recursive: true });
    await fs.writeFile(filePath, bytes);
    try {
      mockFindUnique.mockResolvedValue({
        id: "ad-2",
        assetTypeId: "at-1",
        assetId: null,
        documentId: null,
        filePath,
        url: null,
        document: null,
      });

      const result = await getAssetDocumentFile("ad-2");

      expect(result.bytes.equals(bytes)).toBe(true);
      expect(result.mimeType).toBe("application/pdf");
      expect(result.fileName).toBe(fileName);
      expect(mockReadBytes).not.toHaveBeenCalled();
    } finally {
      await fs.unlink(filePath).catch(() => {});
      await fs.rmdir(legacyDir).catch(() => {});
    }
  });

  it("throws when legacy filePath escapes LEGACY_FILE_ROOT", async () => {
    // Path outside public/uploads — even if it exists, must be rejected.
    const escapingPath = path.join(os.tmpdir(), "outside-uploads.pdf");
    mockFindUnique.mockResolvedValue({
      id: "ad-3",
      assetTypeId: "at-1",
      assetId: null,
      documentId: null,
      filePath: escapingPath,
      url: null,
      document: null,
    });

    await expect(getAssetDocumentFile("ad-3")).rejects.toThrow(
      /outside|root|invalid/i,
    );
  });

  it("throws when AssetDocument has only url (no documentId, no filePath)", async () => {
    mockFindUnique.mockResolvedValue({
      id: "ad-4",
      assetTypeId: "at-1",
      assetId: null,
      documentId: null,
      filePath: null,
      url: "https://example.com/manual.pdf",
      document: null,
    });

    await expect(getAssetDocumentFile("ad-4")).rejects.toThrow(
      /no file bytes/i,
    );
  });

  it("throws when assetDocumentId does not exist", async () => {
    mockFindUnique.mockResolvedValue(null);
    await expect(getAssetDocumentFile("missing-id")).rejects.toThrow(
      /not found/i,
    );
  });
});
