/* eslint-disable no-console */
/**
 * Document processor — standalone poller (ADR-0050 β1.4).
 *
 * Run via: `npm run jobs:extract`
 *
 * Loop:
 *   1. (once at startup) reset any stuck "running" rows older than 5min
 *   2. claim next pending "extract" job via FOR UPDATE SKIP LOCKED
 *   3. if no job → sleep IDLE_POLL_MS and continue
 *   4. if job → processExtract → markSucceeded/markFailed (handled inside
 *      processExtract via complete.ts)
 *   5. honour SIGINT/SIGTERM with a single-cycle drain then disconnect
 *
 * β1 ships a SINGLE poller instance — the SKIP-LOCKED claim makes
 * multi-poller deployment safe later without code changes. Configurable
 * via env: JOBS_POLL_IDLE_MS, JOBS_STALE_RUNNING_MS.
 */

import { claimNextJob } from "@/lib/jobs/claim";
import { processExtract } from "@/lib/jobs/processExtract";
import {
  resetStaleRunningJobs,
  DEFAULT_STALE_RUNNING_MS,
} from "@/lib/jobs/staleReset";
import { prisma } from "@/lib/prisma";

const IDLE_POLL_MS = Number(process.env.JOBS_POLL_IDLE_MS ?? 2_000);
const STALE_RUNNING_MS = Number(
  process.env.JOBS_STALE_RUNNING_MS ?? DEFAULT_STALE_RUNNING_MS,
);

let shuttingDown = false;

function log(event: string, fields: Record<string, unknown> = {}) {
  console.log(
    JSON.stringify({ ts: new Date().toISOString(), event, ...fields }),
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  log("startup", { idlePollMs: IDLE_POLL_MS, staleRunningMs: STALE_RUNNING_MS });

  const resetCount = await resetStaleRunningJobs(new Date(), STALE_RUNNING_MS);
  if (resetCount > 0) {
    log("stale_reset", { count: resetCount });
  }

  process.on("SIGINT", () => {
    log("shutdown_signal", { signal: "SIGINT" });
    shuttingDown = true;
  });
  process.on("SIGTERM", () => {
    log("shutdown_signal", { signal: "SIGTERM" });
    shuttingDown = true;
  });

  while (!shuttingDown) {
    const job = await claimNextJob("extract");

    if (!job) {
      await sleep(IDLE_POLL_MS);
      continue;
    }

    log("job_claimed", {
      jobId: job.id,
      documentId: job.documentId,
      attempts: job.attempts,
    });
    const startedAt = Date.now();
    try {
      await processExtract(job);
      log("job_processed", {
        jobId: job.id,
        documentId: job.documentId,
        elapsedMs: Date.now() - startedAt,
      });
    } catch (err) {
      // processExtract itself catches and marks failed. This catch is a
      // last-resort guard so a bug in processExtract doesn't kill the loop.
      log("job_orchestration_error", {
        jobId: job.id,
        documentId: job.documentId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  log("shutdown_drained");
  await prisma.$disconnect();
}

main().catch(async (err) => {
  log("fatal", { error: err instanceof Error ? err.message : String(err) });
  await prisma.$disconnect().catch(() => {});
  process.exit(1);
});
