#!/usr/bin/env node
/**
 * review-classify — pure mechanical commit classifier for the ETRC rhythm.
 *
 * Given a commit SHA, examines its diff and assigns one of three tiers:
 *   - trivial   → docs-only / chore(scripts|deps) / single small file
 *   - risky     → schema / migrations / api / auth / instructions / package.json
 *                 / >300 LOC / src/lib | src/data changed without tests
 *   - standard  → everything else
 *
 * Outputs JSON to stdout. Exit 0 on success. Exit 0 with `tier:"unknown"` if
 * the commit can't be classified (don't ever block the post-commit hook).
 *
 * Usage:
 *   node scripts/review-classify.mjs <sha>
 *   node scripts/review-classify.mjs HEAD        # default
 *
 * Reference: ADR-0049 (ETRC rhythm + commit queue).
 */

import { execSync } from 'node:child_process';

const RISKY_PATH_PATTERNS = [
  /^prisma\/schema\.prisma$/,
  /^prisma\/migrations\//,
  /^src\/app\/api\//,
  /^src\/lib\/auth/,
  /^src\/middleware/,
  /^\.github\/instructions\//,
];

const TDD_TRIGGER_PATHS = [/^src\/lib\//, /^src\/data\//];
const TEST_FILE_PATTERN = /\.test\.(ts|tsx|mjs)$/;

const TRIVIAL_PATH_PATTERNS = [
  /^docs\//,
  /^\.github\/handoffs\//,
  /^README\.md$/,
  /^TESTING\.md$/,
];

const RISKY_LOC_THRESHOLD = 300;
const TRIVIAL_LOC_THRESHOLD = 30;

function git(cmd) {
  return execSync(`git ${cmd}`, { encoding: 'utf8' }).trim();
}

function safeGit(cmd) {
  try {
    return git(cmd);
  } catch {
    return null;
  }
}

function classify(sha) {
  // Resolve SHA first — fail soft if it doesn't exist.
  const resolved = safeGit(`rev-parse --verify ${sha}`);
  if (!resolved) {
    return { tier: 'unknown', signals: {}, reason: `sha not found: ${sha}` };
  }

  const files = (safeGit(`show --name-only --format= ${resolved}`) || '')
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean);

  // git show --shortstat → " 5 files changed, 123 insertions(+), 7 deletions(-)"
  const shortstat = safeGit(`show --shortstat --format= ${resolved}`) || '';
  const insMatch = shortstat.match(/(\d+)\s+insertion/);
  const delMatch = shortstat.match(/(\d+)\s+deletion/);
  const insertions = insMatch ? Number(insMatch[1]) : 0;
  const deletions = delMatch ? Number(delMatch[1]) : 0;
  const loc = insertions + deletions;

  const subject = safeGit(`log -1 --format=%s ${resolved}`) || '';
  const filesChanged = files.length;

  // Pattern signals.
  const matchesAny = (patterns) => files.some((f) => patterns.some((p) => p.test(f)));
  const touchesSchema = files.some((f) => f === 'prisma/schema.prisma');
  const touchesMigration = files.some((f) => f.startsWith('prisma/migrations/'));
  const touchesApi = files.some((f) => f.startsWith('src/app/api/'));
  const touchesAuth = files.some((f) => f.startsWith('src/lib/auth') || f.startsWith('src/middleware'));
  const touchesInstructions = files.some((f) => f.startsWith('.github/instructions/'));
  const touchesPackageJson = files.some((f) => f === 'package.json');
  const tddTriggered =
    matchesAny(TDD_TRIGGER_PATHS) &&
    !files.some((f) => TEST_FILE_PATTERN.test(f));

  const signals = {
    filesChanged,
    loc,
    insertions,
    deletions,
    touchesSchema,
    touchesMigration,
    touchesApi,
    touchesAuth,
    touchesInstructions,
    touchesPackageJson,
    tddMissingTests: tddTriggered,
    subjectPrefix: subject.split(/[\s(:]/)[0] || '',
  };

  // Tier resolution: risky > trivial > standard.
  const riskyByPath = matchesAny(RISKY_PATH_PATTERNS) || touchesPackageJson;
  const riskyByLoc = loc > RISKY_LOC_THRESHOLD;
  const riskyByTdd = tddTriggered;

  if (riskyByPath || riskyByLoc || riskyByTdd) {
    return {
      tier: 'risky',
      signals,
      reasons: [
        riskyByPath && 'matches risky path pattern',
        riskyByLoc && `loc=${loc} > ${RISKY_LOC_THRESHOLD}`,
        riskyByTdd && 'src/lib or src/data touched without tests',
      ].filter(Boolean),
    };
  }

  const trivialByPath =
    files.length > 0 && files.every((f) => TRIVIAL_PATH_PATTERNS.some((p) => p.test(f)));
  const trivialByChore =
    /^chore\((scripts|deps|deps-dev)\)/.test(subject) && loc <= RISKY_LOC_THRESHOLD;
  const trivialBySize = filesChanged === 1 && loc <= TRIVIAL_LOC_THRESHOLD;

  if (trivialByPath || trivialByChore || trivialBySize) {
    return {
      tier: 'trivial',
      signals,
      reasons: [
        trivialByPath && 'all files match trivial path patterns',
        trivialByChore && 'chore(scripts|deps) under loc threshold',
        trivialBySize && `single-file under ${TRIVIAL_LOC_THRESHOLD} LOC`,
      ].filter(Boolean),
    };
  }

  return { tier: 'standard', signals, reasons: ['no risky or trivial trigger fired'] };
}

const sha = process.argv[2] || 'HEAD';
try {
  const result = classify(sha);
  result.sha = safeGit(`rev-parse --short ${sha}`) || sha;
  result.fullSha = safeGit(`rev-parse ${sha}`) || sha;
  result.subject = safeGit(`log -1 --format=%s ${sha}`) || '';
  result.classifiedAt = new Date().toISOString();
  console.log(JSON.stringify(result, null, 2));
  process.exit(0);
} catch (err) {
  // Never crash — always print something parseable.
  console.log(
    JSON.stringify({
      tier: 'unknown',
      sha,
      error: err?.message || String(err),
      classifiedAt: new Date().toISOString(),
    })
  );
  process.exit(0);
}
