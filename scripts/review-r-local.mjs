#!/usr/bin/env node
/**
 * review-r-local — design-only "is there a better way?" check via local gemma4.
 *
 * Called by review-log.mjs as a detached process for risky-tier commits.
 * Runs OUTSIDE the git commit critical path — appends its result to the queue
 * whenever Ollama gets around to it (could be ~20-40s).
 *
 *  1. Healthcheck: GET http://localhost:11434/api/tags. If down, log
 *     skipped:ollama-unavailable and exit clean.
 *  2. Fetch diff and changed-files for the SHA.
 *  3. Prompt gemma4:26b with a narrow design-only question, capped to 80 chars.
 *  4. Append { type:"review", sha, result, model } line to queue.
 *
 * Hard contract: NEVER throw. All failures land in the queue as a logged result.
 *
 * Usage:
 *   node scripts/review-r-local.mjs <full-sha>
 *
 * Override model via env: R_LOCAL_MODEL=qwen3-coder:30b node scripts/review-r-local.mjs ...
 *
 * Reference: ADR-0049 (ETRC rhythm + commit queue).
 */

import { execFileSync } from 'node:child_process';
import { appendFileSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');
const QUEUE_PATH = join(REPO_ROOT, 'docs', 'review-queue.jsonl');

const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';
const MODEL = process.env.R_LOCAL_MODEL || 'gemma4:26b';
const MAX_DIFF_CHARS = 8000; // gemma4 26b context window respects this comfortably
const MAX_RESPONSE_CHARS = 200; // hard cap on what we surface; expect 80 chars typical

function safeAppend(line) {
  try {
    mkdirSync(dirname(QUEUE_PATH), { recursive: true });
    appendFileSync(QUEUE_PATH, line + '\n', 'utf8');
  } catch {
    // Last-ditch: print to stderr, will be captured by lefthook log if available.
    console.error('[review-r-local] queue append failed');
  }
}

function logResult(sha, result, extras = {}) {
  safeAppend(
    JSON.stringify({
      type: 'review',
      sha,
      result,
      model: MODEL,
      reviewedAt: new Date().toISOString(),
      ...extras,
    })
  );
}

async function healthcheck() {
  try {
    const res = await fetch(`${OLLAMA_URL}/api/tags`, {
      signal: AbortSignal.timeout(2000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

function safeGit(args) {
  try {
    return execFileSync('git', args, {
      encoding: 'utf8',
      maxBuffer: 16 * 1024 * 1024,
      cwd: REPO_ROOT,
    });
  } catch {
    return null;
  }
}

function fetchDiff(sha) {
  const diff = safeGit(['show', '--no-color', '--format=%n%B%n---DIFF---%n', sha]);
  if (!diff) return null;
  if (diff.length > MAX_DIFF_CHARS) {
    return diff.slice(0, MAX_DIFF_CHARS) + '\n\n[...diff truncated for prompt budget...]';
  }
  return diff;
}

const PROMPT_TEMPLATE = `You are reviewing a git commit diff for ONE specific concern only: is there an obvious DESIGN improvement that the author missed in the moment? Examples of what counts:

- This could be extracted to a helper that already exists in the codebase.
- This logic belongs in a different file/module per the project's structural conventions.
- A reusable utility was reimplemented inline.
- The code duplicates a pattern that should be a shared abstraction.

DO NOT comment on: correctness, edge cases, performance, security, style, naming, comments, types, error handling, tests, or anything else. ONLY structural/design improvements.

If you see one clear improvement, reply with ONE LINE of at most 80 characters describing it. Start with a verb (Extract / Move / Reuse / Inline).

If you see no obvious design improvement, reply with exactly: clean

The commit diff:

`;

async function askOllama(diff) {
  const body = {
    model: MODEL,
    prompt: PROMPT_TEMPLATE + diff,
    stream: false,
    options: {
      temperature: 0.2,
      num_predict: 64, // hard cap on response length at model level
    },
  };

  const res = await fetch(`${OLLAMA_URL}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(120_000), // 2 min hard cap; gemma4:26b typically <40s
  });

  if (!res.ok) {
    throw new Error(`ollama status ${res.status}`);
  }

  const data = await res.json();
  return (data?.response || '').trim();
}

function normalize(raw) {
  // Strip leading/trailing quotes, code fences, multi-line bloat.
  let s = raw.replace(/```[\s\S]*?```/g, '').trim();
  s = s.replace(/^["'`]+|["'`]+$/g, '').trim();
  // Take only the first non-empty line.
  s = s.split('\n').map((l) => l.trim()).filter(Boolean)[0] || '';
  if (s.length > MAX_RESPONSE_CHARS) {
    s = s.slice(0, MAX_RESPONSE_CHARS - 1) + '…';
  }
  return s;
}

async function main() {
  const sha = process.argv[2];
  if (!sha) {
    logResult('unknown', 'skipped:no-sha-argument');
    return;
  }

  const startedAt = Date.now();

  if (!(await healthcheck())) {
    logResult(sha, 'skipped:ollama-unavailable');
    return;
  }

  const diff = fetchDiff(sha);
  if (!diff) {
    logResult(sha, 'skipped:diff-fetch-failed');
    return;
  }

  let raw;
  try {
    raw = await askOllama(diff);
  } catch (err) {
    logResult(sha, `skipped:ollama-error:${err?.message?.slice(0, 60) || 'unknown'}`);
    return;
  }

  const normalized = normalize(raw);
  if (!normalized) {
    logResult(sha, 'skipped:empty-response');
    return;
  }

  const result =
    normalized.toLowerCase() === 'clean' ? 'clean' : normalized;

  logResult(sha, result, { latencyMs: Date.now() - startedAt });
}

main().catch((err) => {
  // Absolute last-line defense.
  try {
    logResult(process.argv[2] || 'unknown', `skipped:unhandled:${err?.message?.slice(0, 60) || 'unknown'}`);
  } catch {
    /* nothing else to do */
  }
});
