import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    documentProcessingJob: {
      updateMany: vi.fn(),
    },
  },
}));

import { prisma } from "@/lib/prisma";
import {
  resetStaleRunningJobs,
  DEFAULT_STALE_RUNNING_MS,
} from "./staleReset";

const mockUpdateMany = vi.mocked(
  prisma.documentProcessingJob.updateMany,
) as unknown as ReturnType<typeof vi.fn>;

describe("resetStaleRunningJobs", () => {
  beforeEach(() => {
    mockUpdateMany.mockReset();
    mockUpdateMany.mockResolvedValue({ count: 0 });
  });

  it("flips `running` jobs whose claimedAt is older than the threshold back to `pending`", async () => {
    const now = new Date("2026-06-25T13:00:00Z");
    mockUpdateMany.mockResolvedValue({ count: 3 });

    const count = await resetStaleRunningJobs(now);

    expect(count).toBe(3);
    expect(mockUpdateMany).toHaveBeenCalledTimes(1);
    const args = mockUpdateMany.mock.calls[0][0] as {
      where: Record<string, unknown>;
      data: Record<string, unknown>;
    };
    expect(args.where.status).toBe("running");
    const claimedAtFilter = args.where.claimedAt as { lt: Date };
    expect(claimedAtFilter.lt).toBeInstanceOf(Date);
    expect(claimedAtFilter.lt.getTime()).toBe(
      now.getTime() - DEFAULT_STALE_RUNNING_MS,
    );
    expect(args.data.status).toBe("pending");
  });

  it("does NOT touch attempts (counter is preserved across the reset)", async () => {
    await resetStaleRunningJobs();
    const args = mockUpdateMany.mock.calls[0][0] as {
      data: Record<string, unknown>;
    };
    expect(args.data.attempts).toBeUndefined();
  });

  it("accepts a custom thresholdMs", async () => {
    const now = new Date("2026-06-25T13:00:00Z");
    const customThreshold = 10 * 60 * 1_000;
    await resetStaleRunningJobs(now, customThreshold);
    const args = mockUpdateMany.mock.calls[0][0] as {
      where: { claimedAt: { lt: Date } };
    };
    expect(args.where.claimedAt.lt.getTime()).toBe(
      now.getTime() - customThreshold,
    );
  });

  it("returns the updateMany count when no stale jobs", async () => {
    mockUpdateMany.mockResolvedValue({ count: 0 });
    const result = await resetStaleRunningJobs();
    expect(result).toBe(0);
  });
});
