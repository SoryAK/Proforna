#!/usr/bin/env node
/**
 * review-queue-read — review-day reader for the ETRC commit queue.
 *
 * Reads docs/review-queue.jsonl (append-only), joins commit + review lines by
 * SHA, and prints a tier-filtered summary.
 *
 * Usage:
 *   npm run review:queue                       # print all entries grouped by tier
 *   npm run review:queue -- --tier risky       # filter to one tier
 *   npm run review:queue -- --since 2026-06-24 # filter by loggedAt (ISO date)
 *   npm run review:queue -- --since 7days      # filter by loggedAt (now - N days)
 *   npm run review:queue -- --since 2w         # filter by loggedAt (now - N weeks)
 *   npm run review:queue -- --since <sha>      # filter by loggedAt (committer date of that SHA)
 *   npm run review:queue -- --json             # raw JSON output for piping
 *
 * Reference: ADR-0049 (ETRC rhythm + commit queue).
 */

import { spawnSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');
const QUEUE_PATH = join(REPO_ROOT, 'docs', 'review-queue.jsonl');

const TIER_ORDER = ['risky', 'standard', 'trivial', 'unknown'];

function parseArgs(argv) {
  const args = { tier: null, since: null, json: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--tier') args.tier = argv[++i];
    else if (a === '--since') args.since = argv[++i];
    else if (a === '--json') args.json = true;
  }
  return args;
}

function loadEntries() {
  if (!existsSync(QUEUE_PATH)) return [];
  const raw = readFileSync(QUEUE_PATH, 'utf8');
  return raw
    .split('\n')
    .filter((line) => line.trim())
    .map((line, i) => {
      try {
        return JSON.parse(line);
      } catch (err) {
        console.error(`[review-queue-read] skipping malformed line ${i + 1}: ${err.message}`);
        return null;
      }
    })
    .filter(Boolean);
}

function joinByCommit(entries) {
  const byFull = new Map();
  const reviewsByFull = new Map();

  for (const e of entries) {
    if (e.type === 'commit') {
      const key = e.fullSha || e.sha;
      byFull.set(key, e);
    } else if (e.type === 'review') {
      const key = e.sha; // R writes the full SHA
      if (!reviewsByFull.has(key)) reviewsByFull.set(key, []);
      reviewsByFull.get(key).push(e);
    }
  }

  return [...byFull.entries()].map(([key, commit]) => ({
    ...commit,
    reviews: reviewsByFull.get(key) || [],
  }));
}

function fmt(joined) {
  const sha = (joined.sha || joined.fullSha || '???').slice(0, 7);
  const tier = (joined.tier || 'unknown').padEnd(8);
  const subj = (joined.subject || '').slice(0, 72);
  let line = `  ${sha}  [${tier}]  ${subj}`;
  if (joined.reasons?.length) {
    line += `\n              reasons: ${joined.reasons.join(' | ')}`;
  }
  for (const r of joined.reviews) {
    line += `\n              R: ${r.result}${r.model ? ` (${r.model})` : ''}`;
  }
  return line;
}

// Resolve --since input to a numeric timestamp (ms since epoch). Accepts:
//   - ISO date / anything Date.parse() accepts ("2026-06-24", "2026-06-24T10:00Z")
//   - Relative duration: "Ndays", "Nd", "Nweeks", "Nw" (case-insensitive)
//   - Git commit SHA (7-40 hex chars) → resolves to that commit's committer date
// Returns { ts, label } on success, null on resolution failure (caller warns).
function resolveSinceTs(input) {
  if (!input) return null;
  const dayMs = 86400 * 1000;

  // Relative duration: <N>(d|days|w|weeks)
  const rel = input.match(/^(\d+)\s*(d|days?|w|weeks?)$/i);
  if (rel) {
    const n = Number(rel[1]);
    const unit = rel[2].toLowerCase();
    const mult = unit.startsWith('w') ? 7 * dayMs : dayMs;
    const ts = Date.now() - n * mult;
    return { ts, label: `${input} (cutoff: ${new Date(ts).toISOString()})` };
  }

  // Git SHA — short or full
  if (/^[0-9a-f]{7,40}$/i.test(input)) {
    const r = spawnSync('git', ['log', '-1', '--format=%cI', input], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      shell: true,
    });
    const iso = (r.stdout || '').trim();
    if (r.status === 0 && iso) {
      const ts = new Date(iso).getTime();
      if (!Number.isNaN(ts)) {
        return { ts, label: `${input} (committer date: ${iso})` };
      }
    }
    return null;
  }

  // ISO date / anything Date can parse
  const ts = new Date(input).getTime();
  if (Number.isNaN(ts)) return null;
  return { ts, label: input };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const entries = loadEntries();

  if (!entries.length) {
    console.log('Review queue is empty. (Expected at docs/review-queue.jsonl)');
    return;
  }

  let joined = joinByCommit(entries);

  if (args.tier) {
    joined = joined.filter((j) => j.tier === args.tier);
  }
  let sinceLabel = null;
  if (args.since) {
    const resolved = resolveSinceTs(args.since);
    if (!resolved) {
      console.error(
        `[review-queue-read] --since: could not resolve "${args.since}" as ISO date / duration (e.g. "7days") / git SHA. Filter ignored.`,
      );
    } else {
      sinceLabel = resolved.label;
      joined = joined.filter((j) => {
        const ts = j.loggedAt ? new Date(j.loggedAt).getTime() : 0;
        return ts >= resolved.ts;
      });
    }
  }

  if (args.json) {
    console.log(JSON.stringify(joined, null, 2));
    return;
  }

  // Group by tier.
  const grouped = new Map(TIER_ORDER.map((t) => [t, []]));
  for (const j of joined) {
    const tier = j.tier || 'unknown';
    if (!grouped.has(tier)) grouped.set(tier, []);
    grouped.get(tier).push(j);
  }

  console.log(`Review queue (${joined.length} commits)`);
  if (args.tier) console.log(`Filter: tier=${args.tier}`);
  if (sinceLabel) console.log(`Filter: since=${sinceLabel}`);
  console.log();

  for (const tier of TIER_ORDER) {
    const list = grouped.get(tier) || [];
    if (!list.length) continue;
    console.log(`── ${tier.toUpperCase()} (${list.length}) ──`);
    for (const j of list) {
      console.log(fmt(j));
    }
    console.log();
  }
}

main();
