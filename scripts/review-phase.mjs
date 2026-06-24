#!/usr/bin/env node
//
// review:phase — phase-end / pre-push gate.
//
// Runs the 5 OSS deterministic gates (column 1 of the review pipeline,
// per ADR-pending), captures structured counts, and compares against
// docs/review-baseline.json. Exits non-zero on regression.
//
// Usage:
//   node scripts/review-phase.mjs                  # check vs baseline (strict)
//   node scripts/review-phase.mjs --accept-net     # allow per-gate regressions
//                                                  # if SUM across gates didn't grow
//   node scripts/review-phase.mjs --write-baseline # capture current state as baseline
//   node scripts/review-phase.mjs --full-scan      # disable Semgrep --baseline-commit
//                                                  # mode (audit total debt, not new
//                                                  # findings only). Default Semgrep
//                                                  # baseline = origin/main.
//   node scripts/review-phase.mjs --baseline <ref> # override the Semgrep baseline ref
//
// Exit codes:
//   0  no regressions (or baseline successfully written)
//   1  regression detected (or vitest failure)
//   2  infra error (missing baseline, gate crashed, parser miss)
//
// Companion to scripts/review-static.mjs (advisory whole-repo run).
// This script is the contract gate: it MUST return non-zero on regression.

import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const baselinePath = resolve(repoRoot, "docs", "review-baseline.json");

const argList = process.argv.slice(2);
const args = new Set(argList);
const writeBaseline = args.has("--write-baseline");
const acceptNet = args.has("--accept-net");
const fullScan = args.has("--full-scan");

// Resolve Semgrep baseline ref. --baseline <ref> overrides the default. When
// --full-scan is set OR the default ref doesn't resolve, pass nothing through
// (review-semgrep.mjs already warn-falls-back, but skipping the arg entirely is
// the cleaner contract).
let semgrepBaselineRef = "origin/main";
const baselineIdx = argList.indexOf("--baseline");
if (baselineIdx >= 0 && argList[baselineIdx + 1]) {
  semgrepBaselineRef = argList[baselineIdx + 1];
}
if (fullScan) {
  semgrepBaselineRef = null;
}

function run(cmd, cmdArgs) {
  return spawnSync(cmd, cmdArgs, {
    cwd: repoRoot,
    encoding: "utf8",
    shell: true,
    maxBuffer: 64 * 1024 * 1024,
  });
}

function captureTsc() {
  const r = run("npx", ["tsc", "--noEmit"]);
  const out = (r.stdout || "") + (r.stderr || "");
  const errors = (out.match(/error TS\d+:/g) || []).length;
  return { errors };
}

function captureEslint() {
  const r = run("npx", ["eslint", "--format", "json", "."]);
  // Babel may print a banner to stdout BEFORE the JSON. Strip prefix.
  let out = r.stdout || "";
  const start = out.indexOf("[");
  if (start > 0) out = out.slice(start);
  let parsed;
  try {
    parsed = JSON.parse(out);
  } catch {
    return { errors: -1, warnings: -1 };
  }
  let errors = 0;
  let warnings = 0;
  for (const f of parsed) {
    for (const m of f.messages) {
      if (m.severity === 2) errors++;
      else warnings++;
    }
  }
  return { errors, warnings };
}

function captureKnip() {
  const r = run("npx", ["knip", "--reporter", "json"]);
  let out = r.stdout || "";
  const start = out.indexOf("{");
  if (start > 0) out = out.slice(start);
  let parsed;
  try {
    parsed = JSON.parse(out);
  } catch {
    return { files: -1, dependencies: -1, devDependencies: -1 };
  }
  let files = 0;
  let deps = 0;
  let devDeps = 0;
  for (const it of parsed.issues || []) {
    files += (it.files || []).length;
    deps += (it.dependencies || []).length;
    devDeps += (it.devDependencies || []).length;
  }
  return { files, dependencies: deps, devDependencies: devDeps };
}

function captureMadge() {
  const r = run("npx", [
    "madge",
    "--circular",
    "--extensions",
    "ts,tsx",
    "src",
  ]);
  const out = (r.stdout || "") + (r.stderr || "");
  if (/No circular/i.test(out)) return { circular: 0 };
  const m = out.match(/Found (\d+) circular/);
  if (m) return { circular: Number(m[1]) };
  // Fallback: count "1) " / "2) " enumerated cycle headers if present.
  const cycles = (out.match(/^\s*\d+\)\s/gm) || []).length;
  return { circular: cycles };
}

function captureVitest() {
  // --coverage activates the reporters configured in vitest.config.ts
  // (text-summary + json-summary). The json-summary file at
  // coverage/coverage-summary.json is then consumed by captureCoverage().
  const r = run("npx", ["vitest", "run", "--coverage"]);
  const out = (r.stdout || "") + (r.stderr || "");
  // Match: "Tests  <chunks separated by |>  (<total>)"
  const m = out.match(/Tests\s+([^\n]+?)\s*\((\d+)\)/);
  if (!m) return { passed: -1, skipped: -1, failed: -1, total: -1 };
  let passed = 0;
  let skipped = 0;
  let failed = 0;
  for (const chunk of m[1].split("|")) {
    const mm = chunk.trim().match(/(\d+)\s+(passed|skipped|failed)/);
    if (!mm) continue;
    const n = Number(mm[1]);
    if (mm[2] === "passed") passed = n;
    else if (mm[2] === "skipped") skipped = n;
    else if (mm[2] === "failed") failed = n;
  }
  return { passed, skipped, failed, total: Number(m[2]) };
}

// Coverage gate (B1 / parked-ideas.md). Reads coverage/coverage-summary.json
// emitted by the vitest --coverage run above. Aggregates per-folder
// covered/total line counts across all files keyed under each folder, then
// computes percentage. Per-folder (weighted) rather than per-file so new
// exploratory files don't immediately block work; per-file gating can be
// promoted later if a real backslide happens.
//
// Folders gated mirror ADR-0018 TDD applyTo: src/lib, src/app/api, src/data.
// Metric is lines.pct only — branches/functions/statements quadruple gate
// noise without proportional signal; promote later if a regression sneaks
// past lines.
function captureCoverage() {
  const summaryPath = resolve(repoRoot, "coverage", "coverage-summary.json");
  if (!existsSync(summaryPath)) {
    return { "src/lib": -1, "src/app/api": -1, "src/data": -1 };
  }
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(summaryPath, "utf8"));
  } catch {
    return { "src/lib": -1, "src/app/api": -1, "src/data": -1 };
  }
  const folders = {
    "src/lib": { covered: 0, total: 0 },
    "src/app/api": { covered: 0, total: 0 },
    "src/data": { covered: 0, total: 0 },
  };
  for (const [key, fileSummary] of Object.entries(parsed)) {
    if (key === "total") continue;
    const normalized = key.replace(/\\/g, "/");
    let matched = null;
    // Order matters: src/app/api must be checked BEFORE src/app would be
    // (it isn't, but defensively check the most specific path first).
    if (normalized.includes("/src/app/api/")) matched = "src/app/api";
    else if (normalized.includes("/src/lib/")) matched = "src/lib";
    else if (normalized.includes("/src/data/")) matched = "src/data";
    if (!matched) continue;
    const lines = fileSummary.lines;
    if (!lines) continue;
    folders[matched].covered += lines.covered ?? 0;
    folders[matched].total += lines.total ?? 0;
  }
  const out = {};
  for (const [folder, { covered, total }] of Object.entries(folders)) {
    out[folder] = total > 0 ? Number(((covered / total) * 100).toFixed(2)) : 0;
  }
  return out;
}

console.log("[review:phase] capturing current state...");
const t0 = Date.now();

// Semgrep runs FIRST as a hard-fail pre-step. ERROR-severity findings are by
// definition regressions (slice-trap rules), so there's no point grinding the
// slower gates if a known anti-pattern has been re-introduced. WARNINGs still
// print as visible debt-flagging but don't block.
//
// Default: --baseline origin/main mode so historic ERROR-severity findings
// (from rules promoted after WARNING-period cleanup) don't fail the gate on
// every run — only NEW occurrences block. --full-scan override audits total.
const semgrepArgs = ["scripts/review-semgrep.mjs"];
if (semgrepBaselineRef) {
  semgrepArgs.push("--baseline", semgrepBaselineRef);
} else {
  semgrepArgs.push("--full-scan");
}
const semgrepRes = run("node", semgrepArgs);
if (semgrepRes.status !== 0) {
  console.error(
    "\n[review:phase] X Semgrep gate failed (ERROR-severity findings). Fix above before re-running.",
  );
  process.exit(1);
}

const current = {
  tsc: captureTsc(),
  eslint: captureEslint(),
  knip: captureKnip(),
  madge: captureMadge(),
  vitest: captureVitest(),
  // captureCoverage MUST run after captureVitest — vitest --coverage writes
  // coverage/coverage-summary.json which captureCoverage then reads.
  coverage: captureCoverage(),
};

const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
console.log(`[review:phase] captured in ${elapsed}s`);

// Detect parser/gate crashes (signaled by -1 sentinel).
for (const [gateName, gate] of Object.entries(current)) {
  for (const [field, value] of Object.entries(gate)) {
    if (value === -1) {
      console.error(
        `[review:phase] ERROR: gate '${gateName}.${field}' failed to capture (got -1). ` +
          `Likely a tool crash or output-shape change. Aborting.`,
      );
      process.exit(2);
    }
  }
}

const commit = run("git", ["rev-parse", "--short", "HEAD"]).stdout.trim() || "unknown";

if (writeBaseline) {
  const snapshot = {
    version: 1,
    capturedAt: new Date().toISOString(),
    commit,
    notes:
      "Phase-end review baseline. Future phases must not regress any gate. " +
      "Regenerate via: npm run review:baseline (after landing improvements).",
    gates: current,
  };
  writeFileSync(
    baselinePath,
    JSON.stringify(snapshot, null, 2) + "\n",
    "utf8",
  );
  console.log(`[review:phase] baseline written -> ${baselinePath}`);
  console.log(JSON.stringify(snapshot, null, 2));
  process.exit(0);
}

if (!existsSync(baselinePath)) {
  console.error(
    `[review:phase] ERROR: no baseline at ${baselinePath}. ` +
      `Run 'npm run review:baseline' first to capture an initial snapshot.`,
  );
  process.exit(2);
}

const baseline = JSON.parse(readFileSync(baselinePath, "utf8"));
const b = baseline.gates;

// vitest.failed > 0 is ALWAYS a hard fail, regardless of --accept-net.
if (current.vitest.failed > 0) {
  console.error(
    `\nX vitest: ${current.vitest.failed} failing test(s) — hard fail (overrides --accept-net)`,
  );
  process.exit(1);
}

const checks = [
  { gate: "tsc.errors", curr: current.tsc.errors, base: b.tsc.errors },
  { gate: "eslint.errors", curr: current.eslint.errors, base: b.eslint.errors },
  { gate: "knip.files", curr: current.knip.files, base: b.knip.files },
  {
    gate: "knip.dependencies",
    curr: current.knip.dependencies,
    base: b.knip.dependencies,
  },
  {
    gate: "knip.devDependencies",
    curr: current.knip.devDependencies,
    base: b.knip.devDependencies,
  },
  { gate: "madge.circular", curr: current.madge.circular, base: b.madge.circular },
];

// Coverage checks (B1). Inverted direction — current < baseline is a
// regression (coverage went DOWN). Coverage regressions are hard fails:
// they do NOT participate in --accept-net. Rationale: count-debt and test
// coverage are not fungible. Trading -5 lint errors for -2pp coverage is a
// bad direction trade. To accept a deliberate coverage drop, regen the
// baseline explicitly via `npm run review:baseline`.
//
// Skipped when baseline lacks a coverage block (back-compat with pre-B1
// baselines). Next `npm run review:baseline` populates it.
const coverageChecks = [];
if (b.coverage) {
  for (const folder of Object.keys(current.coverage)) {
    if (typeof b.coverage[folder] === "number") {
      coverageChecks.push({
        gate: `coverage.${folder}`,
        curr: current.coverage[folder],
        base: b.coverage[folder],
      });
    }
  }
}

const regressions = checks.filter((c) => c.curr > c.base);
const improvements = checks.filter((c) => c.curr < c.base);
const coverageRegressions = coverageChecks.filter((c) => c.curr < c.base);
const coverageImprovements = coverageChecks.filter((c) => c.curr > c.base);

console.log(`\n=== review:phase (baseline commit: ${baseline.commit}) ===`);
console.log("gate                       current   baseline   delta");
console.log("-".repeat(60));
for (const c of checks) {
  const delta = c.curr - c.base;
  const marker = delta > 0 ? "X" : delta < 0 ? "v" : " ";
  const sign = delta > 0 ? "+" : "";
  console.log(
    `${marker} ${c.gate.padEnd(25)} ${String(c.curr).padStart(7)}  ${String(
      c.base,
    ).padStart(8)}   ${sign}${delta}`,
  );
}
// Coverage rows — inverted: regression marker on DROP (delta < 0).
for (const c of coverageChecks) {
  const delta = Number((c.curr - c.base).toFixed(2));
  const marker = delta < 0 ? "X" : delta > 0 ? "v" : " ";
  const sign = delta > 0 ? "+" : "";
  console.log(
    `${marker} ${c.gate.padEnd(25)} ${String(c.curr).padStart(7)}  ${String(
      c.base,
    ).padStart(8)}   ${sign}${delta}%`,
  );
}
console.log(
  `  vitest passed/skipped/failed:  ${current.vitest.passed}/${current.vitest.skipped}/${current.vitest.failed}` +
    `   (baseline ${b.vitest.passed}/${b.vitest.skipped}/${b.vitest.failed})`,
);

const currTotal = checks.reduce((s, c) => s + c.curr, 0);
const baseTotal = checks.reduce((s, c) => s + c.base, 0);
const netDelta = currTotal - baseTotal;
const netSign = netDelta >= 0 ? "+" : "";
console.log(
  `\ntotal across all gates:    current=${currTotal}  baseline=${baseTotal}  net=${netSign}${netDelta}`,
);

if (regressions.length === 0 && coverageRegressions.length === 0) {
  const allImprovements = improvements.length + coverageImprovements.length;
  if (allImprovements > 0) {
    console.log(
      `\nv no regressions (${allImprovements} improvement${allImprovements === 1 ? "" : "s"})`,
    );
    console.log(
      "  Consider 'npm run review:baseline' to lock in the new lower bound.",
    );
  } else {
    console.log("\nv no regressions");
  }
  process.exit(0);
}

// Coverage regressions are HARD FAILS — they bypass --accept-net (see
// rationale on coverageChecks above).
if (coverageRegressions.length > 0) {
  console.log(
    `\nX ${coverageRegressions.length} coverage regression(s) detected (hard fail — not eligible for --accept-net)`,
  );
  console.log(
    "  Either restore the lost coverage or, if the drop is intentional, regen baseline via 'npm run review:baseline'.",
  );
  process.exit(1);
}

if (acceptNet && netDelta <= 0) {
  console.log(
    `\n! ${regressions.length} per-gate regression(s) BUT net delta is ${netSign}${netDelta} — accepted via --accept-net`,
  );
  console.log(
    "  Consider 'npm run review:baseline' after landing to capture the net improvement.",
  );
  process.exit(0);
}

console.log(`\nX ${regressions.length} regression(s) detected`);
if (acceptNet) {
  console.log(
    `  --accept-net was passed but net delta (+${netDelta}) is still positive`,
  );
}
process.exit(1);
