import { prisma } from "@/lib/prisma";
import { computeNextScheduledAt } from "./backoff";

/**
 * Job completion helpers (ADR-0050 β1.2).
 *
 * `markJobSucceeded` is unconditional: a successful extract/embed flips
 * the row terminal-positive.
 *
 * `markJobFailed` is conditional on `attempts vs maxAttempts`:
 * - When attempts < maxAttempts, the job goes back to `pending` with
 *   `scheduledFor` advanced via exponential backoff (`backoff.ts`).
 *   The poller will pick it up again after the cooldown.
 * - When attempts >= maxAttempts, the job is terminal-failed and never
 *   retried. β1.4's poller logs these for human triage.
 *
 * Note: attempts was incremented in `claimNextJob` at claim time, not
 * here. By the time `markJobFailed` runs, the value already reflects this
 * attempt — `attempts >= maxAttempts` is the correct terminal predicate.
 */

void computeNextScheduledAt; // referenced below — tree-shake protection above the API surface

export async function markJobSucceeded(
  jobId: string,
  now: Date = new Date(),
): Promise<void> {
  await prisma.documentProcessingJob.update({
    where: { id: jobId },
    data: {
      status: "succeeded",
      completedAt: now,
      lastError: null,
    },
  });
}

export async function markJobFailed(
  jobId: string,
  error: string,
  now: Date = new Date(),
): Promise<void> {
  const { attempts, maxAttempts } = await prisma.documentProcessingJob.findUniqueOrThrow({
    where: { id: jobId },
    select: { attempts: true, maxAttempts: true },
  });

  const isTerminal = attempts >= maxAttempts;

  await prisma.documentProcessingJob.update({
    where: { id: jobId },
    data: isTerminal
      ? {
          status: "failed",
          completedAt: now,
          lastError: error,
        }
      : {
          status: "pending",
          lastError: error,
          scheduledFor: computeNextScheduledAt(attempts, now),
        },
  });
}
