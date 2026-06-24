#!/usr/bin/env node
/**
 * review-semgrep.mjs — Tier A2 wrapper that runs Semgrep against semgrep/rules/.
 *
 * Cross-platform discovery: Semgrep is installed via pipx into the user-local
 * Python bin dir, which isn't always on PATH (especially on Windows). This
 * wrapper resolves the binary in PATH first, then falls back to common pipx
 * install locations so the script works without requiring shell config edits.
 *
 * Exits non-zero when any ERROR-severity rule fires — wired into review:phase
 * via npm script and into the pre-push hook indirectly through that gate.
 *
 * --baseline <ref>     Only report findings introduced since <ref> (passes
 *                      through to Semgrep as --baseline-commit). Useful when
 *                      a rule has been promoted to ERROR but historic
 *                      callsites would otherwise block every gate invocation.
 *                      Ref must resolve via `git rev-parse --verify`.
 * --full-scan          No-op alias for "no baseline" — scan the full target.
 *                      Explicit form used by review-phase.mjs override flow.
 * <target>             Last positional arg overrides default "src/".
 *                      All other unknown args are passed through to Semgrep.
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir, platform } from "node:os";
import { join, resolve } from "node:path";

const isWin = platform() === "win32";
const exe = isWin ? "semgrep.exe" : "semgrep";

function resolveSemgrep() {
  // 1. PATH
  const which = spawnSync(isWin ? "where" : "which", [exe], { encoding: "utf8" });
  if (which.status === 0) {
    const first = which.stdout.split(/\r?\n/).find((l) => l.trim().length > 0);
    if (first && existsSync(first.trim())) return first.trim();
  }
  // 2. pipx install location (Windows + unix)
  const candidates = [
    join(homedir(), ".local", "bin", exe),
    join(homedir(), ".local", "pipx", "venvs", "semgrep", "Scripts", exe),
    join(homedir(), ".local", "pipx", "venvs", "semgrep", "bin", exe),
  ];
  for (const c of candidates) {
    if (existsSync(c)) return c;
  }
  return null;
}

const semgrep = resolveSemgrep();
if (!semgrep) {
  console.error(
    "Semgrep not found. Install with:\n" +
      "  python -m pip install --user pipx\n" +
      "  python -m pipx install semgrep\n" +
      "Then re-run: npm run review:semgrep",
  );
  process.exit(2);
}

const rulesDir = resolve(process.cwd(), "semgrep", "rules");

// Arg parsing — strip --baseline <ref>, --full-scan, and the trailing positional
// target out of process.argv before forwarding the rest to Semgrep. Anything
// else passes through unchanged for future flexibility.
const passthrough = [];
let baselineRef = null;
let positionalTarget = null;
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === "--baseline") {
    baselineRef = argv[++i];
    continue;
  }
  if (a === "--full-scan") {
    baselineRef = null;
    continue;
  }
  if (!a.startsWith("--")) {
    positionalTarget = a;
    continue;
  }
  passthrough.push(a);
}
const target = positionalTarget || "src/";

// Validate baseline ref resolves locally — falsey ref or unresolved ref falls
// back to full-scan with a stderr warning so the gate stays useful when
// origin/main hasn't been fetched yet (fresh clone, offline dev).
if (baselineRef) {
  const verify = spawnSync("git", ["rev-parse", "--verify", baselineRef], {
    encoding: "utf8",
  });
  if (verify.status !== 0) {
    console.error(
      `[review:semgrep] WARNING: baseline ref '${baselineRef}' does not resolve. Falling back to full-scan.`,
    );
    baselineRef = null;
  }
}

// Semgrep exit codes:
//   0 = no findings OR findings only at non-ERROR severities (WARNING/INFO)
//   1 = ERROR-severity findings (gate must fail)
//   2 = semgrep/config error
//
// `--severity ERROR` combined with `--error` makes Semgrep exit 1 only when at
// least one ERROR-level rule matched. WARNING findings still print (visibility
// for tech-debt patterns) but don't block. This lets us introduce rules on
// codebases with historic violations without immediately blocking work — we
// promote a rule from WARNING to ERROR after the debt is cleaned up.
//
// `--baseline-commit <ref>` narrows findings to those introduced since <ref>,
// so a rule promoted to ERROR doesn't immediately fail the gate on the
// pre-existing debt drain — only new occurrences block. Full-scan mode (no
// baseline) still surfaces the total debt for review-day audits.
const semgrepArgs = [
  "--config",
  rulesDir,
  "--severity",
  "ERROR",
  "--error",
  "--disable-version-check",
];
if (baselineRef) {
  semgrepArgs.push("--baseline-commit", baselineRef);
}
semgrepArgs.push(...passthrough, target);

const result = spawnSync(semgrep, semgrepArgs, { stdio: "inherit" });

process.exit(result.status ?? 1);
