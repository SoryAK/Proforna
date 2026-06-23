#!/usr/bin/env node
/**
 * Column 2 verify-stage runner for ADR-0047.
 *
 * Reads a slice manifest from docs/c-yard/<slug>.json, walks every entryPoint
 * × knownTrap, sends each pair to gemma4:26b via Ollama, and produces:
 *
 *   1. JSON audit trail at docs/review-semantic/<slice>-<shortsha>.json
 *   2. Markdown summary on stdout
 *
 * v1 is ADVISORY — exit code is always 0 regardless of findings. Wire into
 * E->T->R->C only after a few weeks of stability evidence (see ADR-0047 §Cons).
 *
 * USAGE
 *   npm run review:semantic -- --slice worklog-editor
 *
 * Requires Ollama running at http://localhost:11434 with gemma4:26b on disk.
 */

import fs from "node:fs/promises";
import path from "node:path";
import { execSync } from "node:child_process";
import { numberLines, buildVerifyPrompt, callOllama, MODEL } from "./lib/semantic-prompt.mjs";

const ROOT = path.resolve(import.meta.dirname, "..");
const SLICES_DIR = path.join(ROOT, "docs", "c-yard");
const OUTPUT_DIR = path.join(ROOT, "docs", "review-semantic");

const VALID_CATEGORIES = new Set(["mechanical", "semantic", "ambiguous"]);
const VALID_STILL_VALID = new Set([true, false, "ambiguous"]);

function parseArgs(argv) {
  const args = { slice: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--slice") args.slice = argv[++i];
    else if (a === "--help" || a === "-h") args.help = true;
    else throw new Error(`Unknown arg: ${a}`);
  }
  return args;
}

function printHelp() {
  console.log(`review-semantic — ADR-0047 Column 2 verify stage

USAGE
  node scripts/review-semantic.mjs --slice <slug>

OPTIONS
  --slice <slug>  Slice manifest slug under docs/c-yard/ (e.g. worklog-editor)
  --help, -h      Show this help

OUTPUTS
  docs/review-semantic/<slice>-<shortsha>.json   (audit trail)
  stdout                                          (markdown summary)

REQUIREMENTS
  Ollama running at http://localhost:11434 with gemma4:26b on disk.`);
}

function shortSha() {
  try {
    return execSync("git rev-parse --short HEAD", { cwd: ROOT, encoding: "utf8" }).trim();
  } catch {
    return "uncommitted";
  }
}

async function loadSlice(slug) {
  const file = path.join(SLICES_DIR, `${slug}.json`);
  const raw = await fs.readFile(file, "utf8");
  return JSON.parse(raw);
}

async function readFileLF(absPath) {
  const raw = await fs.readFile(absPath, "utf8");
  return raw.replace(/\r\n/g, "\n");
}

/**
 * Validate the model response against the schema + consistency rules.
 * Returns { ok: true, finding } or { ok: false, reason }.
 */
function validateResponse(parsed, fileLineCount) {
  if (!parsed || typeof parsed !== "object") {
    return { ok: false, reason: "response is not an object" };
  }
  if (!Array.isArray(parsed.comparisonChecklist) || parsed.comparisonChecklist.length < 2) {
    return { ok: false, reason: `comparisonChecklist must be array of length >= 2` };
  }
  for (const [i, item] of parsed.comparisonChecklist.entries()) {
    if (!item || typeof item !== "object") return { ok: false, reason: `checklist[${i}] not an object` };
    if (typeof item.claim !== "string" || !item.claim.trim()) return { ok: false, reason: `checklist[${i}].claim empty` };
    if (typeof item.matchedInCode !== "boolean") return { ok: false, reason: `checklist[${i}].matchedInCode not boolean` };
    if (typeof item.lineRef !== "number" || item.lineRef < 1 || item.lineRef > fileLineCount) {
      return { ok: false, reason: `checklist[${i}].lineRef out of range: ${JSON.stringify(item.lineRef)} (file has ${fileLineCount} lines)` };
    }
  }
  if (!VALID_STILL_VALID.has(parsed.stillValid)) {
    return { ok: false, reason: `stillValid invalid: ${JSON.stringify(parsed.stillValid)}` };
  }
  if (typeof parsed.evidence !== "string" || !parsed.evidence.trim()) {
    return { ok: false, reason: `evidence missing or empty` };
  }
  if (!Array.isArray(parsed.citedLines) || parsed.citedLines.length === 0) {
    return { ok: false, reason: `citedLines missing or empty` };
  }
  for (const ln of parsed.citedLines) {
    if (typeof ln !== "number" || ln < 1 || ln > fileLineCount) {
      return { ok: false, reason: `citedLines contains out-of-range value: ${JSON.stringify(ln)}` };
    }
  }
  if (!VALID_CATEGORIES.has(parsed.category)) {
    return { ok: false, reason: `category invalid: ${JSON.stringify(parsed.category)}` };
  }
  // Consistency check: if ANY checklist item is not matched, stillValid MUST NOT be true.
  const anyUnmatched = parsed.comparisonChecklist.some((it) => it.matchedInCode === false);
  if (anyUnmatched && parsed.stillValid === true) {
    return { ok: false, reason: "inconsistent: stillValid=true while at least one checklist item is matchedInCode=false" };
  }
  return { ok: true, finding: parsed };
}

async function runTrap({ slice, entryPoint, trapIndex, trapText, filePath, fileNumbered, fileLineCount }) {
  const prompt = buildVerifyPrompt({
    slice,
    entryPointId: entryPoint.id,
    trapText,
    filePath,
    fileNumbered,
  });

  let attempt = 0;
  let lastError = null;
  while (attempt < 2) {
    attempt++;
    let result;
    try {
      result = await callOllama(prompt);
    } catch (err) {
      lastError = `ollama error: ${err.message}`;
      continue;
    }
    let parsed;
    try {
      parsed = JSON.parse(result.response);
    } catch (err) {
      lastError = `json parse error: ${err.message}`;
      continue;
    }
    const validation = validateResponse(parsed, fileLineCount);
    if (!validation.ok) {
      lastError = validation.reason;
      continue;
    }
    return {
      ok: true,
      finding: {
        entryPointId: entryPoint.id,
        trapIndex,
        trapText,
        primaryPath: filePath,
        stillValid: validation.finding.stillValid,
        evidence: validation.finding.evidence,
        citedLines: validation.finding.citedLines,
        category: validation.finding.category,
        comparisonChecklist: validation.finding.comparisonChecklist,
        elapsedMs: result.elapsedMs,
        attempts: attempt,
      },
    };
  }
  return {
    ok: false,
    dropped: {
      entryPointId: entryPoint.id,
      trapIndex,
      trapText,
      primaryPath: filePath,
      reason: lastError,
      attempts: attempt,
    },
  };
}

function buildMarkdownSummary({ slice, commit, model, stats, findings, dropped, totalElapsedMs }) {
  const lines = [];
  lines.push(`[review:semantic] slice=${slice} commit=${commit} model=${model}`);
  lines.push(
    `  totalTraps=${stats.totalTraps} | stillValid=${stats.stillValid} | stale=${stats.stale} | ambiguous=${stats.ambiguous} | dropped=${stats.dropped}`,
  );
  lines.push(`  elapsed=${(totalElapsedMs / 1000).toFixed(1)}s`);
  lines.push("");
  if (findings.length > 0) {
    lines.push("FINDINGS");
    for (const f of findings) {
      const tag =
        f.stillValid === true ? "[still-valid]" : f.stillValid === false ? "[stale]      " : "[ambiguous]  ";
      const head = `${f.trapText.slice(0, 80).replace(/\s+/g, " ")}${f.trapText.length > 80 ? "..." : ""}`;
      lines.push(`  ${tag} ${f.entryPointId} / trap[${f.trapIndex}] (${f.category}, ${f.elapsedMs}ms) ${head}`);
    }
    lines.push("");
  }
  if (dropped.length > 0) {
    lines.push("DROPPED");
    for (const d of dropped) {
      lines.push(`  ${d.entryPointId} / trap[${d.trapIndex}] — ${d.reason}`);
    }
    lines.push("");
  }
  return lines.join("\n");
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }
  if (!args.slice) {
    console.error("ERROR: --slice <slug> is required.\n");
    printHelp();
    process.exit(2);
  }

  let slice;
  try {
    slice = await loadSlice(args.slice);
  } catch (err) {
    console.error(`ERROR: failed to load slice "${args.slice}": ${err.message}`);
    process.exit(2);
  }

  if (!Array.isArray(slice.entryPoints)) {
    console.error(`ERROR: slice "${args.slice}" has no entryPoints array`);
    process.exit(2);
  }

  const commit = shortSha();
  const runAt = new Date().toISOString();
  const findings = [];
  const dropped = [];
  let totalTraps = 0;

  const tStart = Date.now();

  console.log(`[review:semantic] slice=${args.slice} commit=${commit} model=${MODEL}`);
  console.log(`[review:semantic] entryPoints=${slice.entryPoints.length}`);

  await fs.mkdir(OUTPUT_DIR, { recursive: true });
  const outFile = path.join(OUTPUT_DIR, `${args.slice}-${commit}.json`);

  // writeProgress: snapshot current state to disk so a mid-run crash still
  // yields a usable partial audit. Called after every trap (and every drop).
  const writeProgress = async (status) => {
    const partialStats = {
      totalTraps,
      stillValid: findings.filter((f) => f.stillValid === true).length,
      stale: findings.filter((f) => f.stillValid === false).length,
      ambiguous: findings.filter((f) => f.stillValid === "ambiguous").length,
      dropped: dropped.length,
    };
    const partial = {
      version: 1,
      slice: args.slice,
      runAt,
      commit,
      model: MODEL,
      status, // "in-progress" | "complete"
      stats: partialStats,
      totalElapsedMs: Date.now() - tStart,
      findings,
      droppedFindings: dropped,
    };
    await fs.writeFile(outFile, JSON.stringify(partial, null, 2) + "\n", "utf8");
  };

  for (const ep of slice.entryPoints) {
    if (!Array.isArray(ep.knownTraps) || ep.knownTraps.length === 0) continue;
    if (typeof ep.primaryPath !== "string" || !ep.primaryPath) {
      console.log(`  [${ep.id}] skipped — no primaryPath`);
      continue;
    }
    const absFile = path.join(ROOT, ep.primaryPath);
    let fileSrc;
    try {
      fileSrc = await readFileLF(absFile);
    } catch (err) {
      console.log(`  [${ep.id}] skipped — could not read ${ep.primaryPath}: ${err.message}`);
      for (let i = 0; i < ep.knownTraps.length; i++) {
        dropped.push({
          entryPointId: ep.id,
          trapIndex: i,
          trapText: ep.knownTraps[i],
          primaryPath: ep.primaryPath,
          reason: `file not readable: ${err.message}`,
          attempts: 0,
        });
        totalTraps++;
      }
      await writeProgress("in-progress");
      continue;
    }
    const fileNumbered = numberLines(fileSrc);
    const fileLineCount = fileSrc.split("\n").length;

    for (let i = 0; i < ep.knownTraps.length; i++) {
      totalTraps++;
      const trapText = ep.knownTraps[i];
      const head = trapText.slice(0, 60).replace(/\s+/g, " ");
      process.stdout.write(`  [${ep.id}] trap[${i}] (${head}...) `);
      const t0 = Date.now();
      const res = await runTrap({
        slice: args.slice,
        entryPoint: ep,
        trapIndex: i,
        trapText,
        filePath: ep.primaryPath,
        fileNumbered,
        fileLineCount,
      });
      const elapsed = Date.now() - t0;
      if (res.ok) {
        const v = res.finding.stillValid;
        const tag = v === true ? "STILL-VALID" : v === false ? "STALE" : "AMBIGUOUS";
        console.log(`${tag} (${elapsed}ms, attempts=${res.finding.attempts})`);
        findings.push(res.finding);
      } else {
        console.log(`DROPPED (${elapsed}ms) — ${res.dropped.reason}`);
        dropped.push(res.dropped);
      }
      await writeProgress("in-progress");
    }
  }

  const totalElapsedMs = Date.now() - tStart;
  const stats = {
    totalTraps,
    stillValid: findings.filter((f) => f.stillValid === true).length,
    stale: findings.filter((f) => f.stillValid === false).length,
    ambiguous: findings.filter((f) => f.stillValid === "ambiguous").length,
    dropped: dropped.length,
  };

  const output = {
    version: 1,
    slice: args.slice,
    runAt,
    commit,
    model: MODEL,
    status: "complete",
    stats,
    totalElapsedMs,
    findings,
    droppedFindings: dropped,
  };

  await fs.writeFile(outFile, JSON.stringify(output, null, 2) + "\n", "utf8");

  console.log("");
  console.log(buildMarkdownSummary({ slice: args.slice, commit, model: MODEL, stats, findings, dropped, totalElapsedMs }));
  console.log(`Output: ${path.relative(ROOT, outFile)}`);
  console.log(`[review:semantic] DONE (advisory — exit 0)`);
}

main().catch((err) => {
  console.error("FATAL:", err.stack || err.message);
  process.exit(99);
});
