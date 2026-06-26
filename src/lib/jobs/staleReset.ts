import { prisma } from "@/lib/prisma";

/**
 * Crash-recovery helper for the document processor (ADR-0050 β1.4).
 *
 * `claimNextJob` only picks `status="pending"` rows. If a poller crashed
 * between claim (which sets `status="running"`) and complete (which
 * flips to `succeeded`/`failed`/back-to-pending), the row would be stuck
 * forever. This helper, run at poller startup, sweeps any `running` row
 * whose `claimedAt` is older than `thresholdMs` (default 5min) back to
 * `pending` so the next claim loop picks them up again. The `attempts`
 * counter is preserved — the row has effectively used up one attempt
 * via the original (now-orphaned) claim.
 */

export const DEFAULT_STALE_RUNNING_MS = 5 * 60 * 1_000; // 5min

export async function resetStaleRunningJobs(
  now: Date = new Date(),
  thresholdMs: number = DEFAULT_STALE_RUNNING_MS,
): Promise<number> {
  const cutoff = new Date(now.getTime() - thresholdMs);
  const result = await prisma.documentProcessingJob.updateMany({
    where: {
      status: "running",
      claimedAt: { lt: cutoff },
    },
    data: {
      status: "pending",
    },
  });
  return result.count;
}
