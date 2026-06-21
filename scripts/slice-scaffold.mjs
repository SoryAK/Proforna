#!/usr/bin/env node
// Slice scaffold — Phase 1 commit 5 (Shipyard).
//
// Scaffolds docs/c-yard/<slug>.json from a path's recent git history, dropping
// the cold-start cost for new slices from ~45 min of hand-authoring to ~3 min
// of yes/no review. Only Layer 1 (bookkeeping) content is auto-filled:
// fileFingerprints, lastValidatedAt, lastValidatedCommit, refreshHistory:[],
// staleSurfaces:[]. Layer 3 (entryPoints, traversalRecipes, knownTraps,
// description) is intentionally left empty as TODO placeholders — the curated
// layer is the entire reason slices exist. ADR-0038 spec.
//
// Usage:
//   npm run slice:scaffold -- <slug> --from-path <path> [--since <days>] [--dry-run]
//
// Example:
//   npm run slice:scaffold -- work-history --from-path src/components/bio --since 30
//
// Refuses to overwrite an existing slice file. _index.json gets a `<slug>: {}`
// stanza appended if not already present.

import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const cyardDir = path.join(repoRoot, "docs", "c-yard");
const indexPath = path.join(cyardDir, "_index.json");

// ─── CLI args ────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const slug = args.find((a) => !a.startsWith("--")) ?? null;
const fromIdx = args.indexOf("--from-path");
const fromPath = fromIdx >= 0 ? args[fromIdx + 1] : null;
const sinceIdx = args.indexOf("--since");
const sinceDays = sinceIdx >= 0 ? Number(args[sinceIdx + 1]) : 14;
const dryRun = args.includes("--dry-run");

function die(msg) {
  console.error(`slice-scaffold: ${msg}`);
  process.exit(1);
}

// ─── Validation ──────────────────────────────────────────────────────────
if (!slug) die("missing <slug> (kebab-case). Usage: npm run slice:scaffold -- <slug> --from-path <path>");
if (!/^[a-z][a-z0-9-]*$/.test(slug)) die(`slug must be kebab-case ([a-z0-9-]+), got: ${slug}`);
if (!fromPath) die("missing --from-path <path>. Provide a repo-relative directory or file path.");
if (!Number.isFinite(sinceDays) || sinceDays <= 0) die(`--since must be a positive integer, got: ${sinceDays}`);

const targetPath = path.join(cyardDir, `${slug}.json`);
if (fs.existsSync(targetPath) && !dryRun) {
  die(`${path.relative(repoRoot, targetPath)} already exists. Refusing to overwrite. Use --dry-run to preview.`);
}

const absFromPath = path.join(repoRoot, fromPath);
if (!fs.existsSync(absFromPath)) {
  die(`--from-path does not exist on disk: ${fromPath}. (paths must be repo-relative.)`);
}

// ─── Git introspection ───────────────────────────────────────────────────
function git(cmd) {
  return execSync(`git ${cmd}`, { cwd: repoRoot, encoding: "utf8" }).trim();
}

const headSha = git("rev-parse --short HEAD");
const today = new Date().toISOString().slice(0, 10);

// `git log --name-only --since=<N>.days <path>` lists every file touched.
// We collect unique paths, filter to source files, sort.
const rawLog = git(`log --name-only --since="${sinceDays}.days.ago" --pretty=format: -- "${fromPath}"`);
const touchedSet = new Set(
  rawLog
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
);

const INCLUDE_RE = /\.(ts|tsx|mjs|js|prisma)$/;
const EXCLUDE_RE = /(\.test\.|\.spec\.|\/__tests__\/|\/node_modules\/|\.d\.ts$)/;
const fingerprintPaths = [...touchedSet]
  .filter((p) => INCLUDE_RE.test(p) && !EXCLUDE_RE.test(p))
  .map((p) => p.replaceAll("\\", "/"))
  .sort();

if (fingerprintPaths.length === 0) {
  console.warn(
    `slice-scaffold: no source files matched in '${fromPath}' over the last ${sinceDays} days. ` +
      "Scaffold will be created with empty fileFingerprints. Consider widening --since or checking the path."
  );
}

// ─── Build skeleton ──────────────────────────────────────────────────────
const titleCased = slug
  .split("-")
  .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
  .join(" ");

const skeleton = {
  $schema: "./README.md#schema-v1",
  slice: slug,
  title: titleCased,
  description: `TODO: one paragraph — what this surface is, what it owns, what routes it covers. Pass the manual Phase 0 trial: can you answer 'show me the ${titleCased} architecture' using only this slice?`,
  lastValidatedAt: today,
  lastValidatedCommit: headSha,
  refreshHistory: [],
  entryPoints: [
    {
      id: "TODO-entrypoint",
      name: "TODO: sub-system name",
      description: "TODO: 2–3 sentences — what it is, why it exists, what owns it. Fill in as you build or as agent traversals surface real questions.",
      primarySymbol: "TODO",
      primaryPath: "TODO",
      relatedSymbols: [],
      knownTraps: []
    }
  ],
  traversalRecipes: [],
  fileFingerprints: fingerprintPaths.map((p) => ({
    path: p,
    role: "TODO",
    lastValidatedAt: today
  })),
  staleSurfaces: []
};

// ─── Output ──────────────────────────────────────────────────────────────
const json = JSON.stringify(skeleton, null, 2) + "\n";

if (dryRun) {
  console.log(`# --- DRY RUN — would write to ${path.relative(repoRoot, targetPath)} ---\n`);
  console.log(json);
  console.log(`# fingerprint count: ${fingerprintPaths.length}`);
  console.log(`# would update _index.json: ${slug}: {}`);
  process.exit(0);
}

fs.writeFileSync(targetPath, json, "utf8");

// ─── Update _index.json ──────────────────────────────────────────────────
const index = JSON.parse(fs.readFileSync(indexPath, "utf8"));
let indexChanged = false;
if (!(slug in index)) {
  index[slug] = {};
  indexChanged = true;
  fs.writeFileSync(indexPath, JSON.stringify(index, null, 2) + "\n", "utf8");
}

// ─── Friendly summary ────────────────────────────────────────────────────
console.log(`✓ scaffolded ${path.relative(repoRoot, targetPath)}`);
console.log(`  slug: ${slug}`);
console.log(`  title: ${titleCased}`);
console.log(`  fingerprints: ${fingerprintPaths.length} files (since ${sinceDays} days ago in '${fromPath}')`);
console.log(`  HEAD: ${headSha}`);
if (indexChanged) console.log(`  _index.json: added '${slug}: {}' stanza`);
console.log(``);
console.log(`Next steps (3-min review pass):`);
console.log(`  1. Fill in 'description' (one paragraph).`);
console.log(`  2. Replace the TODO entryPoint with one real sub-system (primarySymbol + primaryPath).`);
console.log(`  3. Tag each fileFingerprint with a 'role' label (or delete files that don't belong).`);
console.log(`  4. Author 1 traversalRecipe from a question you've actually answered about this surface.`);
console.log(`  5. Manual Phase 0 trial — fresh-read the slice, ensure it answers a foundational question without falling through to codegraph.`);
