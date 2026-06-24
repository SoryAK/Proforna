#!/usr/bin/env node
/**
 * review-escalate — manual premium re-review for a flagged commit.
 *
 * Local gemma4 said something interesting (or nothing useful) and you want a
 * second opinion from a premium subagent. Prints the diff + a focused prompt
 * to paste into Copilot / a subagent invocation. Pure formatter — no API calls.
 *
 * Usage:
 *   npm run review:escalate <sha>
 *
 * Reference: ADR-0049 (ETRC rhythm + commit queue).
 */

import { execFileSync } from 'node:child_process';

function safeGit(args) {
  try {
    return execFileSync('git', args, { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
  } catch (err) {
    console.error(`git ${args.join(' ')} failed: ${err.message}`);
    process.exit(1);
  }
}

const sha = process.argv[2];
if (!sha) {
  console.error('Usage: npm run review:escalate <sha>');
  process.exit(1);
}

const resolved = safeGit(['rev-parse', '--verify', sha]).trim();
const subject = safeGit(['log', '-1', '--format=%s', resolved]).trim();
const body = safeGit(['log', '-1', '--format=%b', resolved]).trim();
const diff = safeGit(['show', '--no-color', resolved]);

console.log('───── REVIEW ESCALATION PROMPT (copy below to subagent) ─────');
console.log();
console.log(`Commit: ${resolved}`);
console.log(`Subject: ${subject}`);
if (body) {
  console.log(`Body:\n${body}`);
}
console.log();
console.log('Please review this commit with a focus on DESIGN and STRUCTURE.');
console.log('Ignore correctness/perf/security/style/tests — those are gated elsewhere.');
console.log();
console.log('Specifically evaluate:');
console.log('  1. Could any of this be extracted to an existing helper or shared utility?');
console.log('  2. Does the code live in the right file/module per project conventions?');
console.log('  3. Is there inline duplication of a pattern that already has an abstraction?');
console.log('  4. Would a more senior engineer have shaped this differently? If so, how?');
console.log();
console.log('Reply with at most 3 concrete suggestions, each ≤ 2 sentences. If nothing,');
console.log('say so explicitly — do not invent issues.');
console.log();
console.log('───── DIFF ─────');
console.log();
console.log(diff);
console.log('───── END DIFF ─────');
