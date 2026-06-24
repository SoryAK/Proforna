#!/usr/bin/env node
/**
 * review-log — post-commit entry point for the ETRC rhythm.
 *
 * Called by lefthook post-commit hook with the just-landed SHA.
 *
 *  1. Classifies the commit (mechanical, ~0 cost).
 *  2. Appends ONE line to docs/review-queue.jsonl: { type: "commit", ... }.
 *  3. If tier === "risky", spawns scripts/review-r-local.mjs detached so the
 *     git commit returns instantly. R-local appends its own type:"review" line
 *     to the queue when done (could be 30s later).
 *
 * Hard contract: NEVER crash, NEVER block. The post-commit hook must not
 * prevent a commit from finalizing. All errors swallowed and logged.
 *
 * Usage:
 *   node scripts/review-log.mjs <sha>
 *
 * Reference: ADR-0049 (ETRC rhythm + commit queue).
 */

import { spawn, execFileSync } from 'node:child_process';
import { appendFileSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');
const QUEUE_PATH = join(REPO_ROOT, 'docs', 'review-queue.jsonl');
const CLASSIFIER = join(__dirname, 'review-classify.mjs');
const R_LOCAL = join(__dirname, 'review-r-local.mjs');

function safeAppend(line) {
  try {
    mkdirSync(dirname(QUEUE_PATH), { recursive: true });
    appendFileSync(QUEUE_PATH, line + '\n', 'utf8');
  } catch {
    // Never escalate — queue write failure is not worth blocking a commit.
  }
}

function safeClassify(sha) {
  try {
    const stdout = execFileSync('node', [CLASSIFIER, sha], { encoding: 'utf8' });
    return JSON.parse(stdout);
  } catch (err) {
    return {
      tier: 'unknown',
      sha,
      error: err?.message || String(err),
      classifiedAt: new Date().toISOString(),
    };
  }
}

const sha = process.argv[2] || 'HEAD';

try {
  const classified = safeClassify(sha);

  const entry = {
    type: 'commit',
    sha: classified.sha,
    fullSha: classified.fullSha,
    subject: classified.subject,
    tier: classified.tier,
    signals: classified.signals,
    reasons: classified.reasons,
    rPending: classified.tier === 'risky',
    loggedAt: new Date().toISOString(),
  };
  safeAppend(JSON.stringify(entry));

  // Fire-and-forget R-local for risky tier. Detached so git commit returns now.
  if (classified.tier === 'risky' && classified.fullSha) {
    try {
      const child = spawn('node', [R_LOCAL, classified.fullSha], {
        detached: true,
        stdio: 'ignore',
        cwd: REPO_ROOT,
      });
      child.unref();
    } catch {
      // Swallow — R is purely advisory.
    }
  }
} catch {
  // Top-level swallow — guarantee exit 0 no matter what.
}

process.exit(0);
