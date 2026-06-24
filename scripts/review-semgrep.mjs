#!/usr/bin/env node
/**
 * review-semgrep.mjs — Tier A2 wrapper that runs Semgrep against semgrep/rules/.
 *
 * Cross-platform discovery: Semgrep is installed via pipx into the user-local
 * Python bin dir, which isn't always on PATH (especially on Windows). This
 * wrapper resolves the binary in PATH first, then falls back to common pipx
 * install locations so the script works without requiring shell config edits.
 *
 * Exits non-zero when any rule fires — wired into review:phase via npm script
 * and into the pre-push hook indirectly through that gate.
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
const target = process.argv[2] || "src/";

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
const result = spawnSync(
  semgrep,
  [
    "--config",
    rulesDir,
    "--severity",
    "ERROR",
    "--error",
    "--disable-version-check",
    target,
  ],
  { stdio: "inherit" },
);

process.exit(result.status ?? 1);
