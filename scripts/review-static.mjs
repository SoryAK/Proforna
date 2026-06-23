#!/usr/bin/env node
// scripts/review-static.mjs
//
// Advisory orchestrator for the static review pipeline. Runs each stage
// (tsc, eslint, knip, madge) independently regardless of exit code, captures
// the full output of each to scripts/_review-<stage>.log, and prints a
// summary table at the end.
//
// This is INFORMATIONAL — it always exits 0. It is not a CI gate. To turn
// any individual stage into a gate, wire it into CI directly via `npm run
// review:<stage>` and let that command's own exit code propagate.

import { spawnSync } from "node:child_process";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = resolve(__dirname, "..");
const logDir = resolve(repoRoot, "scripts");

/** @type {Array<{ id: string, label: string, cmd: string, args: string[] }>} */
const stages = [
  {
    id: "types",
    label: "tsc --noEmit",
    cmd: "npx",
    args: ["--no-install", "tsc", "--noEmit"],
  },
  {
    id: "lint",
    label: "eslint (next + sonarjs + security)",
    cmd: "npx",
    args: ["--no-install", "eslint", "."],
  },
  {
    id: "knip",
    label: "knip --reporter compact",
    cmd: "npx",
    args: ["--no-install", "knip", "--reporter", "compact"],
  },
  {
    id: "madge",
    label: "madge --circular src",
    cmd: "npx",
    args: [
      "--no-install",
      "madge",
      "--circular",
      "--extensions",
      "ts,tsx",
      "src",
    ],
  },
];

/** @type {Array<{ id: string, label: string, exit: number, ms: number, lines: number, logPath: string }>} */
const results = [];

for (const stage of stages) {
  const start = Date.now();
  console.log(`\n[review:static] ▶ ${stage.label}`);
  const res = spawnSync(stage.cmd, stage.args, {
    cwd: repoRoot,
    encoding: "utf8",
    shell: true,
    // Keep output reasonable even on huge codebases.
    maxBuffer: 64 * 1024 * 1024,
  });
  const ms = Date.now() - start;
  const stdout = res.stdout ?? "";
  const stderr = res.stderr ?? "";
  const combined = stdout + (stderr ? `\n--- stderr ---\n${stderr}` : "");
  const lines = combined.split(/\r?\n/).length;
  const logPath = resolve(logDir, `_review-${stage.id}.log`);
  mkdirSync(logDir, { recursive: true });
  writeFileSync(logPath, combined, "utf8");
  results.push({
    id: stage.id,
    label: stage.label,
    exit: res.status ?? -1,
    ms,
    lines,
    logPath,
  });
  console.log(
    `[review:static] ◀ ${stage.label} exit=${res.status} (${(ms / 1000).toFixed(
      1,
    )}s, ${lines} lines) → ${logPath}`,
  );
}

// Final summary table.
console.log("\n========== review:static summary ==========");
const header = ["stage", "exit", "seconds", "lines", "log"];
const rows = results.map((r) => [
  r.id,
  String(r.exit),
  (r.ms / 1000).toFixed(1),
  String(r.lines),
  r.logPath.replace(repoRoot, ".").replaceAll("\\", "/"),
]);
const widths = header.map((h, i) =>
  Math.max(h.length, ...rows.map((r) => r[i].length)),
);
const fmt = (cols) => cols.map((c, i) => c.padEnd(widths[i])).join("  ");
console.log(fmt(header));
console.log(widths.map((w) => "-".repeat(w)).join("  "));
for (const row of rows) {
  console.log(fmt(row));
}
console.log(
  "\nAdvisory: this script always exits 0. Inspect individual logs for findings.\n",
);

process.exit(0);
