import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    documentProcessingJob: {
      findFirst: vi.fn(),
      create: vi.fn(),
    },
  },
}));

import { prisma } from "@/lib/prisma";
import { enqueueExtractJob, type EnqueuedJob } from "./enqueue";

const mockFindFirst = vi.mocked(prisma.documentProcessingJob.findFirst) as unknown as ReturnType<
  typeof vi.fn
>;
const mockCreate = vi.mocked(prisma.documentProcessingJob.create) as unknown as ReturnType<
  typeof vi.fn
>;

function existingJob(overrides: Partial<EnqueuedJob> = {}): EnqueuedJob {
  return {
    id: "existing-job",
    documentId: "doc-1",
    kind: "extract",
    status: "pending",
    attempts: 0,
    maxAttempts: 5,
    scheduledFor: new Date("2026-06-25T10:00:00Z"),
    claimedAt: null,
    completedAt: null,
    lastError: null,
    createdAt: new Date("2026-06-25T10:00:00Z"),
    updatedAt: new Date("2026-06-25T10:00:00Z"),
    ...overrides,
  };
}

function createdJob(overrides: Partial<EnqueuedJob> = {}): EnqueuedJob {
  return {
    id: "new-job",
    documentId: "doc-1",
    kind: "extract",
    status: "pending",
    attempts: 0,
    maxAttempts: 5,
    scheduledFor: new Date("2026-06-25T13:00:00Z"),
    claimedAt: null,
    completedAt: null,
    lastError: null,
    createdAt: new Date("2026-06-25T13:00:00Z"),
    updatedAt: new Date("2026-06-25T13:00:00Z"),
    ...overrides,
  };
}

describe("enqueueExtractJob", () => {
  beforeEach(() => {
    mockFindFirst.mockReset();
    mockCreate.mockReset();
  });

  it("creates a pending extract job when no prior job exists for the document", async () => {
    mockFindFirst.mockResolvedValue(null);
    const now = new Date("2026-06-25T13:00:00Z");
    mockCreate.mockResolvedValue(createdJob({ scheduledFor: now }));

    const result = await enqueueExtractJob("doc-1", now);

    expect(mockCreate).toHaveBeenCalledTimes(1);
    const args = mockCreate.mock.calls[0][0] as { data: Record<string, unknown> };
    expect(args.data).toMatchObject({
      kind: "extract",
      status: "pending",
      scheduledFor: now,
    });
    // Doc relation passed via connect (cascade FK).
    expect(args.data.document).toEqual({ connect: { id: "doc-1" } });
    expect(result.id).toBe("new-job");
  });

  it("queries by documentId + kind=extract + non-terminal status set", async () => {
    mockFindFirst.mockResolvedValue(null);
    mockCreate.mockResolvedValue(createdJob());

    await enqueueExtractJob("doc-7");

    expect(mockFindFirst).toHaveBeenCalledTimes(1);
    const args = mockFindFirst.mock.calls[0][0] as { where: Record<string, unknown> };
    expect(args.where).toMatchObject({
      documentId: "doc-7",
      kind: "extract",
    });
    // Status filter must restrict to non-terminal — i.e. status IN ("pending","running").
    const statusFilter = args.where.status as { in: string[] };
    expect(statusFilter).toBeDefined();
    expect(new Set(statusFilter.in)).toEqual(new Set(["pending", "running"]));
  });

  it("is idempotent: returns the existing pending job without creating a new one", async () => {
    const existing = existingJob({ status: "pending" });
    mockFindFirst.mockResolvedValue(existing);

    const result = await enqueueExtractJob("doc-1");

    expect(mockCreate).not.toHaveBeenCalled();
    expect(result).toEqual(existing);
  });

  it("is idempotent: returns the existing running job without creating a new one", async () => {
    const existing = existingJob({ status: "running" });
    mockFindFirst.mockResolvedValue(existing);

    const result = await enqueueExtractJob("doc-1");

    expect(mockCreate).not.toHaveBeenCalled();
    expect(result).toEqual(existing);
  });

  it("allows re-enqueue when prior job is terminal — findFirst's status filter handles this", async () => {
    // findFirst should return null because the status filter excludes
    // terminal rows, so a terminal-only history reaches the create branch.
    mockFindFirst.mockResolvedValue(null);
    mockCreate.mockResolvedValue(createdJob());

    await enqueueExtractJob("doc-1");

    expect(mockCreate).toHaveBeenCalledTimes(1);
  });

  it("defaults `now` to the current time when omitted", async () => {
    mockFindFirst.mockResolvedValue(null);
    mockCreate.mockImplementation(async (args: { data: { scheduledFor: Date } }) =>
      createdJob({ scheduledFor: args.data.scheduledFor }),
    );

    const before = Date.now();
    await enqueueExtractJob("doc-1");
    const after = Date.now();

    const args = mockCreate.mock.calls[0][0] as { data: { scheduledFor: Date } };
    expect(args.data.scheduledFor.getTime()).toBeGreaterThanOrEqual(before);
    expect(args.data.scheduledFor.getTime()).toBeLessThanOrEqual(after);
  });
});
