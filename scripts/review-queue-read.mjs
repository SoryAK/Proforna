#!/usr/bin/env node
/**
 * review-queue-read — review-day reader for the ETRC commit queue.
 *
 * Reads docs/review-queue.jsonl (append-only), joins commit + review lines by
 * SHA, and prints a tier-filtered summary.
 *
 * Usage:
 *   npm run review:queue                 # print all entries grouped by tier
 *   npm run review:queue -- --tier risky # filter to one tier
 *   npm run review:queue -- --since 2026-06-24 # filter by loggedAt date
 *   npm run review:queue -- --json       # raw JSON output for piping
 *
 * Reference: ADR-0049 (ETRC rhythm + commit queue).
 */

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
  if (args.since) {
    const sinceTs = new Date(args.since).getTime();
    if (!Number.isNaN(sinceTs)) {
      joined = joined.filter((j) => {
        const ts = j.loggedAt ? new Date(j.loggedAt).getTime() : 0;
        return ts >= sinceTs;
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
  if (args.since) console.log(`Filter: since=${args.since}`);
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
