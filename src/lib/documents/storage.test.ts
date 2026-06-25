import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { promises as fs } from "fs";
import path from "path";
import os from "os";
import { createHash } from "crypto";
import { readDocumentBytes, createDocument } from "./storage";

// Schema-faithful mock (ADR 2026-06-22): only the delegate we exercise.
vi.mock("@/lib/prisma", () => ({
  prisma: { document: { create: vi.fn() } },
}));

// β1.3: enqueue is a thin delegate; the helper's own contract is verified
// in `enqueue.test.ts`. Here we only assert that createDocument calls it
// when (and only when) intent + MIME allow.
vi.mock("@/lib/jobs/enqueue", () => ({
  enqueueExtractJob: vi.fn(),
}));

import { prisma } from "@/lib/prisma";
import { enqueueExtractJob } from "@/lib/jobs/enqueue";
// Prisma's `create` returns a Prisma__DocumentClient (thennable, not a plain
// Promise) — loosen the mock binding so test-side mockImplementations can
// return plain async functions without TS complaint.
const mockCreate = vi.mocked(prisma.document.create) as unknown as ReturnType<
  typeof vi.fn
>;
const mockEnqueue = vi.mocked(enqueueExtractJob) as unknown as ReturnType<
  typeof vi.fn
>;

describe("readDocumentBytes", () => {
  it("returns Buffer from legacy base64 data when filePath is null", async () => {
    const bytes = Buffer.from("legacy inline content", "utf-8");
    const buf = await readDocumentBytes({
      filePath: null,
      data: bytes.toString("base64"),
    });
    expect(buf.equals(bytes)).toBe(true);
  });

  it("returns Buffer from disk when filePath is set", async () => {
    const bytes = Buffer.from("disk-backed content", "utf-8");
    const tmpPath = path.join(os.tmpdir(), `storage-test-${Date.now()}-${Math.random()}.bin`);
    await fs.writeFile(tmpPath, bytes);
    try {
      const buf = await readDocumentBytes({ filePath: tmpPath, data: null });
      expect(buf.equals(bytes)).toBe(true);
    } finally {
      await fs.unlink(tmpPath).catch(() => {});
    }
  });

  it("throws when both filePath and data are null", async () => {
    await expect(
      readDocumentBytes({ filePath: null, data: null }),
    ).rejects.toThrow(/no bytes/i);
  });
});

describe("createDocument", () => {
  let tmpRoot: string;

  beforeEach(async () => {
    tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), "doc-storage-test-"));
    mockCreate.mockReset();
    mockEnqueue.mockReset();
  });

  afterEach(async () => {
    await fs.rm(tmpRoot, { recursive: true, force: true });
  });

  it("writes bytes to <storageRoot>/<userId>/<id>.<ext> and stores filePath in Prisma row", async () => {
    const bytes = Buffer.from("%PDF-1.4\n%test\n", "utf-8");
    mockCreate.mockImplementation(async (args) => {
      return { id: "fake-id", ...args.data } as never;
    });

    const created = await createDocument({
      userId: "user1",
      name: "Test PDF",
      fileName: "test.pdf",
      mimeType: "application/pdf",
      bytes,
      category: "other",
      entityType: null,
      entityId: null,
      notes: null,
      folderId: null,
      storageRoot: tmpRoot,
    });

    // Capture what was passed to Prisma
    expect(mockCreate).toHaveBeenCalledTimes(1);
    const createArgs = mockCreate.mock.calls[0][0] as { data: { id: string; filePath: string; contentHash: string; data: null } };
    const { data } = createArgs;

    expect(data.data).toBeNull();
    expect(data.filePath).toBeTruthy();
    expect(data.filePath).toBe(path.join(tmpRoot, "user1", `${data.id}.pdf`));

    // File actually written with the bytes we passed
    const onDisk = await fs.readFile(data.filePath);
    expect(onDisk.equals(bytes)).toBe(true);

    // returned object reflects what Prisma "returned"
    expect(created).toBeTruthy();
  });

  it("computes SHA-256 contentHash matching the bytes", async () => {
    const bytes = Buffer.from("hash-target content", "utf-8");
    const expectedHash = createHash("sha256").update(bytes).digest("hex");

    mockCreate.mockImplementation(async (args) => ({ id: "fake", ...args.data }) as never);

    await createDocument({
      userId: "user1",
      name: "h.txt",
      fileName: "h.txt",
      mimeType: "text/plain",
      bytes,
      category: "other",
      entityType: null,
      entityId: null,
      notes: null,
      folderId: null,
      storageRoot: tmpRoot,
    });

    const createArgs = mockCreate.mock.calls[0][0] as { data: { contentHash: string } };
    expect(createArgs.data.contentHash).toBe(expectedHash);
  });

  it("creates per-user directory tree on first write", async () => {
    // Confirm the userId dir does NOT exist yet
    const userDir = path.join(tmpRoot, "freshUser");
    await expect(fs.access(userDir)).rejects.toThrow();

    mockCreate.mockImplementation(async (args) => ({ id: "fake", ...args.data }) as never);

    await createDocument({
      userId: "freshUser",
      name: "n.txt",
      fileName: "n.txt",
      mimeType: "text/plain",
      bytes: Buffer.from("hi"),
      category: "other",
      entityType: null,
      entityId: null,
      notes: null,
      folderId: null,
      storageRoot: tmpRoot,
    });

    // Now it exists
    const stat = await fs.stat(userDir);
    expect(stat.isDirectory()).toBe(true);
  });

  it("derives extension from mimeType for all allowed types", async () => {
    const cases: Array<[string, string]> = [
      ["application/pdf", "pdf"],
      ["image/png", "png"],
      ["image/jpeg", "jpg"],
      ["image/webp", "webp"],
      ["application/msword", "doc"],
      ["application/vnd.openxmlformats-officedocument.wordprocessingml.document", "docx"],
      ["text/plain", "txt"],
      ["text/csv", "csv"],
      ["application/octet-stream", "bin"], // fallback
    ];

    for (const [mimeType, ext] of cases) {
      mockCreate.mockReset();
      mockCreate.mockImplementation(async (args) => ({ id: "fake", ...args.data }) as never);

      await createDocument({
        userId: `u-${ext}`,
        name: `t.${ext}`,
        fileName: `t.${ext}`,
        mimeType,
        bytes: Buffer.from("x"),
        category: "other",
        entityType: null,
        entityId: null,
        notes: null,
        folderId: null,
        storageRoot: tmpRoot,
      });

      const createArgs = mockCreate.mock.calls[0][0] as { data: { filePath: string } };
      expect(createArgs.data.filePath, `mime=${mimeType}`).toMatch(
        new RegExp(`\\.${ext}$`),
      );
    }
  });

  describe("enqueueExtractJob flag (ADR-0050 β1.3)", () => {
    it("does NOT call enqueueExtractJob when flag is omitted (default false)", async () => {
      mockCreate.mockImplementation(
        async (args: { data: Record<string, unknown> }) =>
          ({ id: args.data.id ?? "fake-id", ...args.data }) as never,
      );

      await createDocument({
        userId: "u1",
        name: "n.pdf",
        fileName: "n.pdf",
        mimeType: "application/pdf",
        bytes: Buffer.from("%PDF-1.4"),
        category: "other",
        entityType: null,
        entityId: null,
        notes: null,
        folderId: null,
        storageRoot: tmpRoot,
      });

      expect(mockEnqueue).not.toHaveBeenCalled();
    });

    it("calls enqueueExtractJob(doc.id) when flag=true AND mimeType is extractable", async () => {
      mockCreate.mockImplementation(
        async (args: { data: Record<string, unknown> }) =>
          ({ id: args.data.id ?? "fake-id", ...args.data }) as never,
      );

      const created = await createDocument({
        userId: "u1",
        name: "n.pdf",
        fileName: "n.pdf",
        mimeType: "application/pdf",
        bytes: Buffer.from("%PDF-1.4"),
        category: "asset_document",
        entityType: "AssetType",
        entityId: "at-1",
        notes: null,
        folderId: null,
        storageRoot: tmpRoot,
        enqueueExtractJob: true,
      });

      expect(mockEnqueue).toHaveBeenCalledTimes(1);
      // First arg is the new document's id, which Prisma returned to us.
      expect(mockEnqueue.mock.calls[0][0]).toBe((created as { id: string }).id);
    });

    it("does NOT call enqueueExtractJob when flag=true but mimeType is NOT extractable (e.g. image/png)", async () => {
      mockCreate.mockImplementation(
        async (args: { data: Record<string, unknown> }) =>
          ({ id: args.data.id ?? "fake-id", ...args.data }) as never,
      );

      await createDocument({
        userId: "u1",
        name: "n.png",
        fileName: "n.png",
        mimeType: "image/png",
        bytes: Buffer.from("PNGDATA"),
        category: "asset_document",
        entityType: "AssetType",
        entityId: "at-1",
        notes: null,
        folderId: null,
        storageRoot: tmpRoot,
        enqueueExtractJob: true,
      });

      expect(mockEnqueue).not.toHaveBeenCalled();
    });
  });
});
