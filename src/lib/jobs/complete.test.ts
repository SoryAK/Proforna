import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    documentProcessingJob: {
      update: vi.fn(),
      findUniqueOrThrow: vi.fn(),
    },
  },
}));

import { prisma } from "@/lib/prisma";
import { markJobSucceeded, markJobFailed } from "./complete";
import { BACKOFF_BASE_MS, BACKOFF_MAX_MS } from "./backoff";

const mockUpdate = vi.mocked(prisma.documentProcessingJob.update) as unknown as ReturnType<
  typeof vi.fn
>;
const mockFindUniqueOrThrow = vi.mocked(
  prisma.documentProcessingJob.findUniqueOrThrow,
) as unknown as ReturnType<typeof vi.fn>;

describe("markJobSucceeded", () => {
  beforeEach(() => {
    mockUpdate.mockReset();
    mockUpdate.mockResolvedValue({});
  });

  it("flips status to 'succeeded' and stamps completedAt", async () => {
    const now = new Date("2026-06-25T13:00:00Z");
    await markJobSucceeded("job-1", now);
    expect(mockUpdate).toHaveBeenCalledTimes(1);
    const call = mockUpdate.mock.calls[0][0];
    expect(call).toMatchObject({
      where: { id: "job-1" },
      data: {
        status: "succeeded",
        completedAt: now,
        lastError: null,
      },
    });
  });

  it("clears any lingering lastError from prior failed attempts", async () => {
    await markJobSucceeded("job-2");
    const call = mockUpdate.mock.calls[0][0];
    expect(call.data.lastError).toBeNull();
  });
});

describe("markJobFailed", () => {
  beforeEach(() => {
    mockUpdate.mockReset();
    mockFindUniqueOrThrow.mockReset();
    mockUpdate.mockResolvedValue({});
  });

  it("schedules a retry with backoff when attempts < maxAttempts", async () => {
    mockFindUniqueOrThrow.mockResolvedValue({ attempts: 1, maxAttempts: 5 });
    const now = new Date("2026-06-25T13:00:00Z");
    await markJobFailed("job-1", "pdfjs threw", now);

    const call = mockUpdate.mock.calls[0][0];
    expect(call.where).toEqual({ id: "job-1" });
    expect(call.data.status).toBe("pending");
    expect(call.data.lastError).toBe("pdfjs threw");
    // attempts=1 → backoff = 60s * 2^1 = 120s
    const expectedScheduledFor = new Date(now.getTime() + BACKOFF_BASE_MS * 2);
    expect((call.data.scheduledFor as Date).getTime()).toBe(
      expectedScheduledFor.getTime(),
    );
    // Should NOT stamp completedAt on a retry-scheduled failure.
    expect(call.data.completedAt).toBeUndefined();
  });

  it("uses the cap when attempts is very large but below maxAttempts", async () => {
    mockFindUniqueOrThrow.mockResolvedValue({ attempts: 6, maxAttempts: 50 });
    const now = new Date("2026-06-25T13:00:00Z");
    await markJobFailed("job-2", "transient", now);

    const call = mockUpdate.mock.calls[0][0];
    expect(call.data.status).toBe("pending");
    expect((call.data.scheduledFor as Date).getTime()).toBe(
      now.getTime() + BACKOFF_MAX_MS,
    );
  });

  it("flips the job to terminal 'failed' when attempts >= maxAttempts", async () => {
    mockFindUniqueOrThrow.mockResolvedValue({ attempts: 5, maxAttempts: 5 });
    const now = new Date("2026-06-25T13:00:00Z");
    await markJobFailed("job-3", "permanent error", now);

    const call = mockUpdate.mock.calls[0][0];
    expect(call.data.status).toBe("failed");
    expect(call.data.lastError).toBe("permanent error");
    expect(call.data.completedAt).toEqual(now);
    // No scheduledFor advancement on terminal failure.
    expect(call.data.scheduledFor).toBeUndefined();
  });

  it("flips to terminal 'failed' when attempts exceeds maxAttempts (defensive)", async () => {
    mockFindUniqueOrThrow.mockResolvedValue({ attempts: 100, maxAttempts: 5 });
    await markJobFailed("job-4", "ran past cap somehow");

    const call = mockUpdate.mock.calls[0][0];
    expect(call.data.status).toBe("failed");
  });

  it("reads attempts via findUniqueOrThrow keyed by jobId", async () => {
    mockFindUniqueOrThrow.mockResolvedValue({ attempts: 1, maxAttempts: 5 });
    await markJobFailed("job-5", "err");
    expect(mockFindUniqueOrThrow).toHaveBeenCalledWith({
      where: { id: "job-5" },
      select: { attempts: true, maxAttempts: true },
    });
  });
});
