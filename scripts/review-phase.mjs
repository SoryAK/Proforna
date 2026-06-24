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
  const r = run("npx", ["vitest", "run"]);
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

const regressions = checks.filter((c) => c.curr > c.base);
const improvements = checks.filter((c) => c.curr < c.base);

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

if (regressions.length === 0) {
  if (improvements.length > 0) {
    console.log(
      `\nv no regressions (${improvements.length} improvement${improvements.length === 1 ? "" : "s"})`,
    );
    console.log(
      "  Consider 'npm run review:baseline' to lock in the new lower bound.",
    );
  } else {
    console.log("\nv no regressions");
  }
  process.exit(0);
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
