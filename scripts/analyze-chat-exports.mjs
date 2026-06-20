#!/usr/bin/env node
// Analyzes exported Copilot chat transcripts in docs/chat-exports/raw/*.jsonl.
// Emits 5-category metrics + dashboard + worst-3 friction digests + deep-dive on a target session.
//
// Usage:
//   node scripts/analyze-chat-exports.mjs [--deep-dive <sessionIdPrefix>]
//
// Outputs land in docs/chat-exports/analysis/ (gitignored).

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const rawDir = path.join(repoRoot, "docs", "chat-exports", "raw");
const outDir = path.join(repoRoot, "docs", "chat-exports", "analysis");
const worst3Dir = path.join(outDir, "worst-3");
const reviewedLedgerPath = path.join(outDir, "reviewed-sessions.json");
const changeLogPath = path.join(outDir, "workflow-change-log.json");
const metricsByEraPath = path.join(outDir, "metrics-by-era.json");

// 24h boundary window for era-tagging Option A (ADR-0036 D3): sessions whose
// startTime is within this many ms of any change ship/adopt event are flagged
// `straddleWindow: true` so downstream aggregators can choose to exclude them.
const STRADDLE_WINDOW_MS = 24 * 60 * 60 * 1000;

// ─── CLI args ────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const deepDiveIdx = args.indexOf("--deep-dive");
const deepDivePrefix = deepDiveIdx >= 0 ? args[deepDiveIdx + 1] : null;
const includeReviewed = args.includes("--include-reviewed");
const markReviewed = args.includes("--mark-reviewed");

// ─── Pattern matchers (cheap heuristics — must be eyeballed for truth) ──
const NEGATION_RE = /\b(no|nope|wait|stop|actually|wrong|incorrect|i told you|again|that's not|don't|do not)\b/i;
const SYMBOL_LIKE_RE = /^[A-Z][a-zA-Z0-9]+$|^use[A-Z][a-zA-Z0-9]+$|^[a-z][a-zA-Z0-9]+[A-Z][a-zA-Z0-9]+$/; // CamelCase / useXxx / camelCase
const SCOPE_EXPAND_RE = /\b(also added|while i was here|also fixed|bonus|additionally|on top of|by the way|i also)\b/i;
const EDIT_TOOLS = new Set([
  "replace_string_in_file",
  "create_file",
  "multi_replace_string_in_file",
  "insert_edit_into_file",
  "apply_patch"
]);
const CODEGRAPH_TOOLS = new Set([
  "mcp_codegraph_codegraph_search",
  "mcp_codegraph_codegraph_context",
  "mcp_codegraph_codegraph_callers",
  "mcp_codegraph_codegraph_callees",
  "mcp_codegraph_codegraph_node",
  "mcp_codegraph_codegraph_explore",
  "mcp_codegraph_codegraph_impact",
  "mcp_codegraph_codegraph_files"
]);
const LOOKUP_TOOLS = new Set([...CODEGRAPH_TOOLS, "grep_search", "read_file", "semantic_search", "file_search"]);
const MEMORY_READ_TOOLS = new Set([
  "mcp_memory-resums_open_nodes",
  "mcp_memory-server_open_nodes",
  "mcp_memory-user-p_open_nodes",
  "mcp_memory-resums_search_nodes",
  "mcp_memory-server_search_nodes",
  "mcp_memory-user-p_search_nodes"
]);
const MEMORY_WRITE_TOOLS = new Set([
  "mcp_memory-resums_add_observations",
  "mcp_memory-server_add_observations",
  "mcp_memory-user-p_add_observations",
  "mcp_memory-resums_create_entities",
  "mcp_memory-server_create_entities",
  "mcp_memory-user-p_create_entities"
]);

// ─── Helpers ─────────────────────────────────────────────────────────────
function readJsonl(filePath) {
  const txt = fs.readFileSync(filePath, "utf8");
  const lines = txt.split(/\r?\n/).filter(Boolean);
  const records = [];
  for (let i = 0; i < lines.length; i++) {
    try {
      records.push(JSON.parse(lines[i]));
    } catch {
      // skip malformed line
    }
  }
  return records;
}

function looksLikeSymbol(query) {
  if (typeof query !== "string") return false;
  // Single-word identifier patterns
  if (query.length > 60) return false;
  // Strip quoting and stop on whitespace — only treat first token as candidate
  const token = query.trim().split(/[\s,]+/)[0]?.replace(/['"`]/g, "");
  if (!token) return false;
  return SYMBOL_LIKE_RE.test(token);
}

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

// ─── Per-session analyzer ───────────────────────────────────────────────
function analyzeSession(filePath) {
  const records = readJsonl(filePath);
  const sessionFile = path.basename(filePath);
  const sessionId = sessionFile.replace(/\.jsonl$/, "");

  let startTime = null;
  let copilotVersion = null;
  const userMessages = [];
  const assistantMessages = [];
  const toolCalls = []; // { toolName, args, success }
  const turnStarts = [];
  const turnEnds = [];

  for (const r of records) {
    switch (r.type) {
      case "session.start":
        startTime = r.data?.startTime || null;
        copilotVersion = r.data?.copilotVersion || null;
        break;
      case "user.message":
        userMessages.push({ content: r.data?.content || "", timestamp: r.timestamp });
        break;
      case "assistant.message":
        assistantMessages.push({
          content: r.data?.content || "",
          timestamp: r.timestamp,
          toolRequests: r.data?.toolRequests || []
        });
        break;
      case "assistant.turn_start":
        turnStarts.push(r.timestamp);
        break;
      case "assistant.turn_end":
        turnEnds.push(r.timestamp);
        break;
      case "tool.execution_start":
        toolCalls.push({
          toolName: r.data?.toolName || "",
          args: r.data?.arguments || {},
          callId: r.data?.toolCallId,
          success: null,
          timestamp: r.timestamp
        });
        break;
      case "tool.execution_complete": {
        const c = toolCalls.find((tc) => tc.callId === r.data?.toolCallId);
        if (c) c.success = !!r.data?.success;
        break;
      }
    }
  }

  // ─── CATEGORY 1: Tool Discipline ──────────────────────────────────────
  // grep-for-symbol violations
  const grepCalls = toolCalls.filter((tc) => tc.toolName === "grep_search");
  const grepForSymbol = grepCalls.filter((tc) => looksLikeSymbol(tc.args?.query));

  // codegraph-first rate: among lookup tools, what fraction is codegraph?
  const lookupCalls = toolCalls.filter((tc) => LOOKUP_TOOLS.has(tc.toolName));
  const codegraphCalls = toolCalls.filter((tc) => CODEGRAPH_TOOLS.has(tc.toolName));
  const codegraphFirstRate = lookupCalls.length ? codegraphCalls.length / lookupCalls.length : null;

  // Post-Edit Scan rate: after each edit tool call, did get_errors fire within next 3 tool calls (same session, monotonic order)?
  const editCalls = toolCalls.filter((tc) => EDIT_TOOLS.has(tc.toolName));
  let postEditScanPaired = 0;
  for (let i = 0; i < toolCalls.length; i++) {
    if (!EDIT_TOOLS.has(toolCalls[i].toolName)) continue;
    const lookahead = toolCalls.slice(i + 1, i + 5);
    if (lookahead.some((tc) => tc.toolName === "get_errors")) postEditScanPaired++;
  }
  const postEditScanRate = editCalls.length ? postEditScanPaired / editCalls.length : null;

  // Memory write discipline: writes preceded by an open_nodes within prior 5 calls?
  const memWrites = toolCalls.filter((tc) => MEMORY_WRITE_TOOLS.has(tc.toolName));
  let memWritesReadFirst = 0;
  for (let i = 0; i < toolCalls.length; i++) {
    if (!MEMORY_WRITE_TOOLS.has(toolCalls[i].toolName)) continue;
    const lookback = toolCalls.slice(Math.max(0, i - 5), i);
    if (lookback.some((tc) => MEMORY_READ_TOOLS.has(tc.toolName))) memWritesReadFirst++;
  }
  const memReadFirstRate = memWrites.length ? memWritesReadFirst / memWrites.length : null;

  // ─── CATEGORY 2: Course-Correction / Friction ────────────────────────
  const negationEvents = [];
  for (const um of userMessages) {
    if (NEGATION_RE.test(um.content)) {
      negationEvents.push({
        content: um.content.length > 200 ? um.content.slice(0, 200) + "…" : um.content,
        timestamp: um.timestamp
      });
    }
  }

  // Repeated tool failures: (toolName) failing ≥2x
  const failsByTool = new Map();
  for (const tc of toolCalls) {
    if (tc.success === false) {
      failsByTool.set(tc.toolName, (failsByTool.get(tc.toolName) || 0) + 1);
    }
  }
  const repeatedFailures = [...failsByTool.entries()].filter(([, n]) => n >= 2);

  // ─── CATEGORY 3: Cost / Efficiency ───────────────────────────────────
  const totalAssistantBytes = assistantMessages.reduce((sum, am) => sum + (am.content?.length || 0), 0);
  const meanAssistantBytes = assistantMessages.length ? Math.round(totalAssistantBytes / assistantMessages.length) : 0;
  const toolCallsPerAssistantTurn = assistantMessages.length
    ? +(toolCalls.length / assistantMessages.length).toFixed(2)
    : 0;
  const durationMs = startTime && turnEnds.length ? (new Date(turnEnds[turnEnds.length - 1]) - new Date(startTime)) : null;
  const durationMin = durationMs ? Math.round(durationMs / 60000) : null;

  // ─── CATEGORY 4: Scope Discipline ────────────────────────────────────
  const scopeExpandHits = [];
  for (const am of assistantMessages) {
    if (SCOPE_EXPAND_RE.test(am.content)) {
      scopeExpandHits.push({
        snippet: am.content.match(SCOPE_EXPAND_RE)[0],
        timestamp: am.timestamp
      });
    }
  }

  // ─── CATEGORY 5: Outcome Quality ─────────────────────────────────────
  // Heuristic: any terminal call running `git commit` or `git push`?
  const terminalCalls = toolCalls.filter((tc) => tc.toolName === "run_in_terminal");
  const commitCount = terminalCalls.filter((tc) =>
    /git\s+(-c\s+\S+\s+)?commit/.test(JSON.stringify(tc.args || ""))
  ).length;
  const pushCount = terminalCalls.filter((tc) =>
    /git\s+(-c\s+\S+\s+)?push/.test(JSON.stringify(tc.args || ""))
  ).length;
  // Handoff doc written?
  const handoffEdit = editCalls.some((tc) => {
    const fp = tc.args?.filePath || tc.args?.path || "";
    return typeof fp === "string" && fp.includes("docs") && fp.includes("handoff");
  });
  // Memory write?
  const wroteMemory = memWrites.length > 0;

  return {
    sessionId,
    sessionFile,
    startTime,
    copilotVersion,
    durationMin,
    counts: {
      userMessages: userMessages.length,
      assistantMessages: assistantMessages.length,
      toolCalls: toolCalls.length,
      editCalls: editCalls.length,
      lookupCalls: lookupCalls.length
    },
    category1_toolDiscipline: {
      grepForSymbolCount: grepForSymbol.length,
      grepTotal: grepCalls.length,
      codegraphFirstRate,
      postEditScanRate,
      memReadFirstRate,
      memWrites: memWrites.length
    },
    category2_friction: {
      negationCount: negationEvents.length,
      negationEvents: negationEvents.slice(0, 10),
      repeatedFailures,
      frictionScore: negationEvents.length * 2 + repeatedFailures.reduce((sum, [, n]) => sum + n, 0)
    },
    category3_efficiency: {
      meanAssistantBytes,
      totalAssistantKB: Math.round(totalAssistantBytes / 1024),
      toolCallsPerAssistantTurn
    },
    category4_scope: {
      scopeExpandHitCount: scopeExpandHits.length,
      scopeExpandHits: scopeExpandHits.slice(0, 5)
    },
    category5_outcome: {
      commitCount,
      pushCount,
      handoffWritten: handoffEdit,
      wroteMemory,
      shippedClean: commitCount > 0 && (postEditScanRate === null || postEditScanRate >= 0.5)
    }
  };
}

// ─── Aggregate dashboard ────────────────────────────────────────────────
function buildSummary(allMetrics) {
  const n = allMetrics.length;
  function avg(getter) {
    const vals = allMetrics.map(getter).filter((v) => v !== null && !Number.isNaN(v));
    return vals.length ? +(vals.reduce((s, v) => s + v, 0) / vals.length).toFixed(2) : null;
  }
  function sum(getter) {
    return allMetrics.reduce((s, m) => s + (getter(m) || 0), 0);
  }
  function pctNonZero(getter) {
    const hits = allMetrics.filter((m) => getter(m) > 0).length;
    return +((hits / n) * 100).toFixed(1);
  }
  function pctTrue(getter) {
    const hits = allMetrics.filter((m) => getter(m) === true).length;
    return +((hits / n) * 100).toFixed(1);
  }

  return {
    totalSessions: n,
    aggregates: {
      category1_toolDiscipline: {
        grep_for_symbol_violations_total: sum((m) => m.category1_toolDiscipline.grepForSymbolCount),
        sessions_with_grep_violation_pct: pctNonZero((m) => m.category1_toolDiscipline.grepForSymbolCount),
        codegraph_first_rate_avg: avg((m) => m.category1_toolDiscipline.codegraphFirstRate),
        post_edit_scan_rate_avg: avg((m) => m.category1_toolDiscipline.postEditScanRate),
        mem_read_first_rate_avg: avg((m) => m.category1_toolDiscipline.memReadFirstRate)
      },
      category2_friction: {
        negation_events_total: sum((m) => m.category2_friction.negationCount),
        sessions_with_negation_pct: pctNonZero((m) => m.category2_friction.negationCount),
        sessions_with_repeated_failures_pct: pctNonZero((m) => m.category2_friction.repeatedFailures.length)
      },
      category3_efficiency: {
        mean_assistant_bytes_avg: avg((m) => m.category3_efficiency.meanAssistantBytes),
        tool_calls_per_turn_avg: avg((m) => m.category3_efficiency.toolCallsPerAssistantTurn),
        total_assistant_kb_sum: sum((m) => m.category3_efficiency.totalAssistantKB)
      },
      category4_scope: {
        scope_expand_hits_total: sum((m) => m.category4_scope.scopeExpandHitCount),
        sessions_with_scope_expand_pct: pctNonZero((m) => m.category4_scope.scopeExpandHitCount)
      },
      category5_outcome: {
        shipped_clean_pct: pctTrue((m) => m.category5_outcome.shippedClean),
        wrote_handoff_pct: pctTrue((m) => m.category5_outcome.handoffWritten),
        wrote_memory_pct: pctTrue((m) => m.category5_outcome.wroteMemory),
        commits_total: sum((m) => m.category5_outcome.commitCount),
        pushes_total: sum((m) => m.category5_outcome.pushCount)
      }
    },
    rankings: {
      most_negation_events: [...allMetrics]
        .sort((a, b) => b.category2_friction.negationCount - a.category2_friction.negationCount)
        .slice(0, 5)
        .map((m) => ({ id: m.sessionId.slice(0, 8), negations: m.category2_friction.negationCount })),
      highest_friction_score: [...allMetrics]
        .sort((a, b) => b.category2_friction.frictionScore - a.category2_friction.frictionScore)
        .slice(0, 5)
        .map((m) => ({ id: m.sessionId.slice(0, 8), frictionScore: m.category2_friction.frictionScore })),
      most_grep_violations: [...allMetrics]
        .sort((a, b) => b.category1_toolDiscipline.grepForSymbolCount - a.category1_toolDiscipline.grepForSymbolCount)
        .slice(0, 5)
        .map((m) => ({ id: m.sessionId.slice(0, 8), grepForSymbol: m.category1_toolDiscipline.grepForSymbolCount })),
      lowest_post_edit_scan_rate: [...allMetrics]
        .filter((m) => m.category1_toolDiscipline.postEditScanRate !== null && m.counts.editCalls >= 3)
        .sort((a, b) => a.category1_toolDiscipline.postEditScanRate - b.category1_toolDiscipline.postEditScanRate)
        .slice(0, 5)
        .map((m) => ({
          id: m.sessionId.slice(0, 8),
          rate: +(m.category1_toolDiscipline.postEditScanRate * 100).toFixed(0) + "%",
          edits: m.counts.editCalls
        }))
    }
  };
}

// ─── Markdown writers ───────────────────────────────────────────────────
function writeSummaryMd(summary, allMetrics, cohorts, outPath) {
  const md = `# Chat-export Analysis — Dashboard

Generated: ${new Date().toISOString()}
Sessions analyzed: ${summary.totalSessions}

## Category 1 — Tool Discipline

| Metric | Value |
| --- | --- |
| Grep-for-symbol violations (total across all sessions) | **${summary.aggregates.category1_toolDiscipline.grep_for_symbol_violations_total}** |
| Sessions with ≥1 grep-for-symbol violation | ${summary.aggregates.category1_toolDiscipline.sessions_with_grep_violation_pct}% |
| Codegraph-first rate (avg, among lookup-tool calls) | ${summary.aggregates.category1_toolDiscipline.codegraph_first_rate_avg} |
| Post-Edit Scan rate (avg, sessions with ≥1 edit) | ${summary.aggregates.category1_toolDiscipline.post_edit_scan_rate_avg} |
| Memory-read-first rate (avg, sessions with ≥1 memory write) | ${summary.aggregates.category1_toolDiscipline.mem_read_first_rate_avg} |

## Category 2 — Course-Correction / Friction

| Metric | Value |
| --- | --- |
| Total user-negation events | **${summary.aggregates.category2_friction.negation_events_total}** |
| Sessions with ≥1 negation event | ${summary.aggregates.category2_friction.sessions_with_negation_pct}% |
| Sessions with repeated tool failures | ${summary.aggregates.category2_friction.sessions_with_repeated_failures_pct}% |

## Category 3 — Efficiency

| Metric | Value |
| --- | --- |
| Mean assistant-response size (bytes/turn) | ${summary.aggregates.category3_efficiency.mean_assistant_bytes_avg} |
| Tool calls per assistant turn (avg) | ${summary.aggregates.category3_efficiency.tool_calls_per_turn_avg} |
| Total assistant output (sum, KB) | ${summary.aggregates.category3_efficiency.total_assistant_kb_sum} |

## Category 4 — Scope Discipline

| Metric | Value |
| --- | --- |
| Silent-scope-expansion phrase hits (total) | **${summary.aggregates.category4_scope.scope_expand_hits_total}** |
| Sessions with ≥1 scope-expansion phrase | ${summary.aggregates.category4_scope.sessions_with_scope_expand_pct}% |

## Category 5 — Outcome Quality

| Metric | Value |
| --- | --- |
| Sessions ending shippable (commit + acceptable scan rate) | ${summary.aggregates.category5_outcome.shipped_clean_pct}% |
| Sessions that wrote a handoff doc | ${summary.aggregates.category5_outcome.wrote_handoff_pct}% |
| Sessions that wrote to memory graph | ${summary.aggregates.category5_outcome.wrote_memory_pct}% |
| Total commits across all sessions | ${summary.aggregates.category5_outcome.commits_total} |
| Total pushes across all sessions | ${summary.aggregates.category5_outcome.pushes_total} |

---

## Rankings (per-session worst offenders)

### Highest friction score (negation × 2 + repeated failures)
${summary.rankings.highest_friction_score.map((r) => `- \`${r.id}\` — friction score **${r.frictionScore}**`).join("\n") || "_none_"}

### Most user-negation events
${summary.rankings.most_negation_events.map((r) => `- \`${r.id}\` — ${r.negations} negation event(s)`).join("\n") || "_none_"}

### Most grep-for-symbol violations
${summary.rankings.most_grep_violations.map((r) => `- \`${r.id}\` — ${r.grepForSymbol} violation(s)`).join("\n") || "_none_"}

### Lowest Post-Edit Scan rate (sessions with ≥3 edits)
${summary.rankings.lowest_post_edit_scan_rate.map((r) => `- \`${r.id}\` — ${r.rate} (${r.edits} edits)`).join("\n") || "_none_"}

---

## Per-session table (top-line only)

| Session | Started | Dur (min) | User msgs | Tool calls | Edits | Grep-sym | Friction | Commits | Handoff |
| --- | --- | --: | --: | --: | --: | --: | --: | --: | :-: |
${[...allMetrics]
  .sort((a, b) => (a.startTime || "").localeCompare(b.startTime || ""))
  .map(
    (m) =>
      `| \`${m.sessionId.slice(0, 8)}\` | ${m.startTime?.slice(0, 10) || "—"} | ${m.durationMin ?? "—"} | ${m.counts.userMessages} | ${m.counts.toolCalls} | ${m.counts.editCalls} | ${m.category1_toolDiscipline.grepForSymbolCount} | ${m.category2_friction.frictionScore} | ${m.category5_outcome.commitCount} | ${m.category5_outcome.handoffWritten ? "✓" : ""} |`
  )
  .join("\n")}

${renderEraSection(cohorts)}`;
  fs.writeFileSync(outPath, md, "utf8");
}

// Renders the "Era Comparison" section appended to metrics-summary.md (ADR-0036 Phase 2 follow-up).
// Centralized so reviewers don't have to open metrics-by-era.json to see cohort trends.
function renderEraSection(cohorts) {
  if (!cohorts || cohorts.length === 0) {
    return `---

## Era Comparison (ADR-0036)

_No cohort data this run. Re-run with \`--include-reviewed\` to populate \`metrics-by-era.json\` and this section._
`;
  }
  const fmt = (n, p = 1) => (n == null ? "—" : Number(n).toFixed(p));
  const pct = (n) => (n == null ? "—" : `${Math.round(n * 100)}%`);
  const flag = (arr, id) => (arr.includes(id) ? "✓" : "·");

  // Highlighted practice/rule columns mirror what the user most often asks about.
  // If you add a new headline practice (e.g. another major workflow shift), bump these IDs.
  const HEADLINE_PRACTICE_ETC = "etc-workflow-pattern";
  const HEADLINE_RULE_TDD = "testing:tdd-phase-2.5";
  const HEADLINE_PRACTICE_VOICE = "voice-dictation-input";

  const tableRows = cohorts
    .map((c) => {
      const a = c.aggregates;
      return `| \`${c.cohortHash}\` | ${c.sessionCount} | ${c.straddleCount} | ${fmt(a.avgGrepForSymbolCount)} | ${pct(a.avgCodegraphFirstRate)} | ${pct(a.avgPostEditScanRate)} | ${fmt(a.avgNegationCount)} | ${fmt(a.avgFrictionScore)} | ${flag(c.activePractices, HEADLINE_PRACTICE_ETC)} | ${flag(c.activeRules, HEADLINE_RULE_TDD)} | ${flag(c.activePractices, HEADLINE_PRACTICE_VOICE)} |`;
    })
    .join("\n");

  const detailBlocks = cohorts
    .map((c) => {
      const rules = c.activeRules.length ? c.activeRules.map((r) => `\`${r}\``).join(", ") : "_(none)_";
      const practices = c.activePractices.length ? c.activePractices.map((p) => `\`${p}\``).join(", ") : "_(none)_";
      const infra = c.activeInfra.length ? c.activeInfra.map((i) => `\`${i}\``).join(", ") : "_(none)_";
      return `### Cohort \`${c.cohortHash}\` — ${c.sessionCount} session(s), ${c.straddleCount} straddle\n- **Rules active:** ${rules}\n- **Practices active:** ${practices}\n- **Infra/tooling active:** ${infra}`;
    })
    .join("\n\n");

  return `---

## Era Comparison (ADR-0036 Phase 2)

Sessions bucketed by which agent rules, user practices, and infra/tooling were active at \`session.startTime\`. **Straddle** = session ran within 24h of one of the listed changes shipping; high-straddle cohorts have less-certain labels, so weight low-straddle cohorts more heavily.

Source: [\`metrics-by-era.json\`](./metrics-by-era.json). Cohorts sorted by session count desc.

| Cohort | Sessions | Straddle | Grep/sym | Codegraph % | Scan % | Negations | Friction | ETC | TDD | Voice |
| --- | --: | --: | --: | --: | --: | --: | --: | :-: | :-: | :-: |
${tableRows}

Headline columns: **ETC** = \`etc-workflow-pattern\` adopted, **TDD** = Phase 2.5 rule active, **Voice** = \`voice-dictation-input\` adopted.

### Active changes per cohort

${detailBlocks}
`;
}

function writeFrictionDigest(m, outPath) {
  const md = `# Friction digest — \`${m.sessionId}\`

- Started: ${m.startTime || "—"}
- Duration: ${m.durationMin ?? "—"} min
- User messages: ${m.counts.userMessages}
- Assistant messages: ${m.counts.assistantMessages}
- Tool calls: ${m.counts.toolCalls} (edits: ${m.counts.editCalls})
- **Friction score:** ${m.category2_friction.frictionScore}

## User-negation events (${m.category2_friction.negationCount})

${m.category2_friction.negationEvents.length === 0 ? "_none_" : m.category2_friction.negationEvents.map((e, i) => `### ${i + 1}. ${e.timestamp || ""}\n\n> ${e.content.replace(/\n/g, "\n> ")}\n`).join("\n")}

## Repeated tool failures

${m.category2_friction.repeatedFailures.length === 0 ? "_none_" : m.category2_friction.repeatedFailures.map(([tool, count]) => `- \`${tool}\` failed **${count}×**`).join("\n")}

## Tool-discipline at a glance

- Grep-for-symbol violations: **${m.category1_toolDiscipline.grepForSymbolCount}** / ${m.category1_toolDiscipline.grepTotal} grep calls
- Codegraph-first rate: ${m.category1_toolDiscipline.codegraphFirstRate ?? "—"}
- Post-Edit Scan rate: ${m.category1_toolDiscipline.postEditScanRate ?? "—"}
- Memory writes: ${m.category1_toolDiscipline.memWrites}, read-first rate: ${m.category1_toolDiscipline.memReadFirstRate ?? "—"}

## Scope-expansion phrase hits

${m.category4_scope.scopeExpandHits.length === 0 ? "_none_" : m.category4_scope.scopeExpandHits.map((h) => `- "${h.snippet}" (${h.timestamp || ""})`).join("\n")}

## Outcome

- Commits: ${m.category5_outcome.commitCount}
- Pushes: ${m.category5_outcome.pushCount}
- Handoff written: ${m.category5_outcome.handoffWritten ? "yes" : "no"}
- Memory written: ${m.category5_outcome.wroteMemory ? "yes" : "no"}
- Shipped clean: ${m.category5_outcome.shippedClean ? "yes" : "no"}
`;
  fs.writeFileSync(outPath, md, "utf8");
}

function writeDeepDive(filePath, outPath) {
  const records = readJsonl(filePath);
  const sessionId = path.basename(filePath).replace(/\.jsonl$/, "");

  // Build a turn-by-turn narrative: user message → assistant text + tool sequence → next user message
  const narrative = [];
  let currentTurn = null;
  for (const r of records) {
    if (r.type === "user.message") {
      if (currentTurn) narrative.push(currentTurn);
      currentTurn = {
        userMessage: r.data?.content || "",
        timestamp: r.timestamp,
        assistantSnippets: [],
        toolSequence: []
      };
    } else if (r.type === "assistant.message" && currentTurn) {
      const c = r.data?.content || "";
      if (c.trim()) currentTurn.assistantSnippets.push(c.length > 400 ? c.slice(0, 400) + "…" : c);
    } else if (r.type === "tool.execution_start" && currentTurn) {
      currentTurn.toolSequence.push(r.data?.toolName || "?");
    }
  }
  if (currentTurn) narrative.push(currentTurn);

  // Per-turn analysis flags
  const annotated = narrative.map((t, idx) => {
    const flags = [];
    if (NEGATION_RE.test(t.userMessage)) flags.push("NEGATION");
    const grepSymCalls = t.toolSequence.filter((tn) => tn === "grep_search").length;
    if (grepSymCalls > 0 && t.toolSequence.some((tn) => CODEGRAPH_TOOLS.has(tn) === false)) {
      // weak heuristic — can't see args here, just count grep calls
    }
    const editCount = t.toolSequence.filter((tn) => EDIT_TOOLS.has(tn)).length;
    const errorCount = t.toolSequence.filter((tn) => tn === "get_errors").length;
    if (editCount > 0 && errorCount === 0) flags.push("MISSING_POST_EDIT_SCAN");
    if (SCOPE_EXPAND_RE.test(t.assistantSnippets.join(" "))) flags.push("SCOPE_EXPAND_PHRASE");
    return { ...t, flags, editCount, errorCount, idx };
  });

  const md = `# Deep dive — \`${sessionId}\`

This is a turn-by-turn annotated walk of the session. Flags surface compliance / friction events for review.

Total turns: ${annotated.length}
Flagged turns: ${annotated.filter((t) => t.flags.length > 0).length}

---

${annotated
  .map((t) => {
    const flagBadge = t.flags.length ? ` **[${t.flags.join(", ")}]**` : "";
    const userBrief =
      t.userMessage.length > 300 ? t.userMessage.slice(0, 300) + "…" : t.userMessage;
    return `### Turn ${t.idx + 1}${flagBadge}

**User** (${t.timestamp || "?"}):
> ${userBrief.replace(/\n/g, "\n> ")}

**Tool sequence** (${t.toolSequence.length} calls): ${t.toolSequence.join(" → ") || "_(none)_"}

**Assistant snippets** (${t.assistantSnippets.length}):
${
  t.assistantSnippets.length === 0
    ? "_(no text output)_"
    : t.assistantSnippets.map((s) => "> " + s.replace(/\n/g, "\n> ")).join("\n\n")
}
`;
  })
  .join("\n---\n\n")}
`;
  fs.writeFileSync(outPath, md, "utf8");
}

// ─── Reviewed-session ledger (ADR-0036 D5, gitignored) ─────────────────
function loadReviewedLedger() {
  if (!fs.existsSync(reviewedLedgerPath)) {
    return { _schemaVersion: 1, _doc: "Auto-created by analyzer.", entries: [] };
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(reviewedLedgerPath, "utf8"));
    if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.entries)) {
      console.warn(`WARN: ${path.relative(repoRoot, reviewedLedgerPath)} malformed (no entries array). Treating as empty.`);
      return { _schemaVersion: 1, entries: [] };
    }
    return parsed;
  } catch (e) {
    console.warn(`WARN: failed to parse ${path.relative(repoRoot, reviewedLedgerPath)} (${e.message}). Treating as empty.`);
    return { _schemaVersion: 1, entries: [] };
  }
}

function reviewedSessionIdSet(ledger) {
  return new Set(ledger.entries.map((e) => e.sessionId));
}

function appendReviewedSessions(ledger, sessionIds, rulesShippedAfter = []) {
  const known = reviewedSessionIdSet(ledger);
  const reviewedAt = new Date().toISOString();
  let added = 0;
  for (const id of sessionIds) {
    if (known.has(id)) continue;
    ledger.entries.push({
      sessionId: id,
      reviewedAt,
      reviewerNotes: "Marked via --mark-reviewed.",
      rulesShippedAfter
    });
    added++;
  }
  if (added > 0) {
    fs.writeFileSync(reviewedLedgerPath, JSON.stringify(ledger, null, 2) + "\n", "utf8");
  }
  return added;
}

// ─── Workflow change-log (ADR-0036 D6, tracked in git) ────────────────
function loadChangeLog() {
  if (!fs.existsSync(changeLogPath)) {
    console.warn(`WARN: ${path.relative(repoRoot, changeLogPath)} missing. Era tagging will produce empty cohorts.`);
    return { streams: { agentRuleEdits: [], userPracticeAdoptions: [], infraToolingChanges: [] } };
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(changeLogPath, "utf8"));
    if (!parsed?.streams) {
      console.warn(`WARN: ${path.relative(repoRoot, changeLogPath)} has no streams. Era tagging degraded.`);
      return { streams: { agentRuleEdits: [], userPracticeAdoptions: [], infraToolingChanges: [] } };
    }
    return parsed;
  } catch (e) {
    console.warn(`WARN: failed to parse ${path.relative(repoRoot, changeLogPath)} (${e.message}). Era tagging degraded.`);
    return { streams: { agentRuleEdits: [], userPracticeAdoptions: [], infraToolingChanges: [] } };
  }
}

// ─── Era tagging (ADR-0036 D3: bucket by session.startTime + straddle flag) ─
function computeEraTagForSession(session, changeLog) {
  const out = { activeRules: [], activePractices: [], activeInfra: [], straddleWindow: false };
  if (!session.startTime) {
    return { ...out, straddleWindow: true, missingStartTime: true };
  }
  const sessionT = new Date(session.startTime).getTime();
  if (Number.isNaN(sessionT)) {
    return { ...out, straddleWindow: true, missingStartTime: true };
  }
  const tagStream = (entries, dateField, bucket) => {
    for (const e of entries || []) {
      const eT = new Date(e[dateField]).getTime();
      if (Number.isNaN(eT)) continue;
      if (eT <= sessionT) bucket.push(e.id);
      if (Math.abs(sessionT - eT) <= STRADDLE_WINDOW_MS) out.straddleWindow = true;
    }
  };
  tagStream(changeLog.streams?.agentRuleEdits, "shippedAt", out.activeRules);
  tagStream(changeLog.streams?.userPracticeAdoptions, "adoptedAt", out.activePractices);
  tagStream(changeLog.streams?.infraToolingChanges, "shippedAt", out.activeInfra);
  out.activeRules.sort();
  out.activePractices.sort();
  out.activeInfra.sort();
  return out;
}

function cohortHashFor(tag) {
  const payload = JSON.stringify({
    rules: tag.activeRules,
    practices: tag.activePractices,
    infra: tag.activeInfra
  });
  return crypto.createHash("sha1").update(payload).digest("hex").slice(0, 12);
}

// Pure: tag every session with its cohort + bucket. Returns { taggedSessions, cohorts }.
// Used by both writeMetricsByEra (sidecar) and writeSummaryMd (centralized review section).
function computeCohorts(allMetrics, changeLog) {
  const taggedSessions = allMetrics.map((m) => {
    const tag = computeEraTagForSession(m, changeLog);
    const cohortHash = cohortHashFor(tag);
    return {
      sessionId: m.sessionId,
      startTime: m.startTime,
      cohortHash,
      activeRules: tag.activeRules,
      activePractices: tag.activePractices,
      activeInfra: tag.activeInfra,
      straddleWindow: tag.straddleWindow,
      missingStartTime: tag.missingStartTime || false,
      // Embed the raw aggregates so Phase 3 can group without re-reading metrics.json
      aggregates: {
        grepForSymbolCount: m.category1_toolDiscipline.grepForSymbolCount,
        codegraphFirstRate: m.category1_toolDiscipline.codegraphFirstRate,
        postEditScanRate: m.category1_toolDiscipline.postEditScanRate,
        memReadFirstRate: m.category1_toolDiscipline.memReadFirstRate,
        negationCount: m.category2_friction.negationCount,
        frictionScore: m.category2_friction.frictionScore,
        meanAssistantBytes: m.category3_efficiency.meanAssistantBytes,
        toolCallsPerAssistantTurn: m.category3_efficiency.toolCallsPerAssistantTurn,
        scopeExpandHitCount: m.category4_scope.scopeExpandHitCount,
        wroteMemory: m.category5_outcome.wroteMemory,
        handoffWritten: m.category5_outcome.handoffWritten,
        shippedClean: m.category5_outcome.shippedClean
      }
    };
  });

  // Bucket by cohortHash. Aggregates are means over sessions in the cohort.
  const cohortMap = new Map();
  for (const s of taggedSessions) {
    if (!cohortMap.has(s.cohortHash)) {
      cohortMap.set(s.cohortHash, {
        cohortHash: s.cohortHash,
        activeRules: s.activeRules,
        activePractices: s.activePractices,
        activeInfra: s.activeInfra,
        sessionIds: [],
        straddleCount: 0
      });
    }
    const c = cohortMap.get(s.cohortHash);
    c.sessionIds.push(s.sessionId);
    if (s.straddleWindow) c.straddleCount++;
  }
  const cohorts = [...cohortMap.values()].map((c) => {
    const sessions = taggedSessions.filter((s) => c.sessionIds.includes(s.sessionId));
    const avg = (key) => {
      const vals = sessions.map((s) => s.aggregates[key]).filter((v) => v !== null && v !== undefined && !Number.isNaN(v));
      return vals.length ? +(vals.reduce((sum, v) => sum + v, 0) / vals.length).toFixed(3) : null;
    };
    const sum = (key) => sessions.reduce((s, sess) => s + (sess.aggregates[key] || 0), 0);
    const pctTrue = (key) => {
      const hits = sessions.filter((s) => s.aggregates[key] === true).length;
      return sessions.length ? +((hits / sessions.length) * 100).toFixed(1) : 0;
    };
    return {
      cohortHash: c.cohortHash,
      sessionCount: c.sessionIds.length,
      straddleCount: c.straddleCount,
      activeRules: c.activeRules,
      activePractices: c.activePractices,
      activeInfra: c.activeInfra,
      sessionIds: c.sessionIds,
      aggregates: {
        avgGrepForSymbolCount: avg("grepForSymbolCount"),
        avgCodegraphFirstRate: avg("codegraphFirstRate"),
        avgPostEditScanRate: avg("postEditScanRate"),
        avgMemReadFirstRate: avg("memReadFirstRate"),
        avgNegationCount: avg("negationCount"),
        avgFrictionScore: avg("frictionScore"),
        avgMeanAssistantBytes: avg("meanAssistantBytes"),
        avgToolCallsPerAssistantTurn: avg("toolCallsPerAssistantTurn"),
        totalScopeExpandHits: sum("scopeExpandHitCount"),
        memWritePct: pctTrue("wroteMemory"),
        handoffWrittenPct: pctTrue("handoffWritten"),
        shippedCleanPct: pctTrue("shippedClean")
      }
    };
  });
  cohorts.sort((a, b) => b.sessionCount - a.sessionCount);
  return { taggedSessions, cohorts };
}

function writeMetricsByEra(taggedSessions, cohorts, changeLog, outPath) {
  const payload = {
    generatedAt: new Date().toISOString(),
    boundaryPolicy: "session.startTime bucketing; straddleWindow flag set when |session.startTime - change.shippedAt| <= 24h (ADR-0036 D3)",
    changeLogStreams: {
      agentRuleEdits: changeLog.streams?.agentRuleEdits?.length || 0,
      userPracticeAdoptions: changeLog.streams?.userPracticeAdoptions?.length || 0,
      infraToolingChanges: changeLog.streams?.infraToolingChanges?.length || 0
    },
    sessions: taggedSessions,
    cohorts
  };
  fs.writeFileSync(outPath, JSON.stringify(payload, null, 2), "utf8");
}

// ─── Main ───────────────────────────────────────────────────────────────
function main() {
  if (!fs.existsSync(rawDir)) {
    console.error("ERROR: no docs/chat-exports/raw/ folder. Export transcripts first.");
    process.exit(1);
  }
  ensureDir(outDir);
  ensureDir(worst3Dir);

  const allFiles = fs
    .readdirSync(rawDir)
    .filter((f) => f.endsWith(".jsonl"))
    .map((f) => path.join(rawDir, f));

  const ledger = loadReviewedLedger();
  const reviewedSet = reviewedSessionIdSet(ledger);

  let files = allFiles;
  if (!includeReviewed) {
    const skipped = allFiles.filter((f) => reviewedSet.has(path.basename(f).replace(/\.jsonl$/, "")));
    files = allFiles.filter((f) => !reviewedSet.has(path.basename(f).replace(/\.jsonl$/, "")));
    if (skipped.length > 0) {
      console.log(`Skipping ${skipped.length} already-reviewed session(s); pass --include-reviewed to override.`);
    }
  } else {
    console.log("--include-reviewed: analyzing all sessions including already-reviewed ones.");
  }

  if (files.length === 0) {
    console.log("No sessions to analyze. Exiting before writing outputs.");
    return;
  }

  console.log(`Analyzing ${files.length} transcripts...`);
  const allMetrics = files.map((f) => analyzeSession(f));
  console.log("Per-session analysis complete.");

  // Write per-session metrics
  fs.writeFileSync(path.join(outDir, "metrics.json"), JSON.stringify(allMetrics, null, 2), "utf8");

  // Aggregate dashboard
  const summary = buildSummary(allMetrics);
  fs.writeFileSync(path.join(outDir, "metrics-summary.json"), JSON.stringify(summary, null, 2), "utf8");

  // Compute cohorts once; feed both the sidecar and the centralized markdown section.
  const changeLog = loadChangeLog();
  const { taggedSessions, cohorts } = computeCohorts(allMetrics, changeLog);

  writeSummaryMd(summary, allMetrics, cohorts, path.join(outDir, "metrics-summary.md"));
  console.log("Dashboard written.");

  // Era-tagged sidecar (ADR-0036 Phase 2) — same cohorts as the markdown section.
  writeMetricsByEra(taggedSessions, cohorts, changeLog, metricsByEraPath);
  console.log(`Era-tagged sidecar written: ${path.relative(repoRoot, metricsByEraPath)}`);

  // Worst-3 friction digests
  const worst3 = [...allMetrics]
    .sort((a, b) => b.category2_friction.frictionScore - a.category2_friction.frictionScore)
    .slice(0, 3);
  for (const m of worst3) {
    writeFrictionDigest(m, path.join(worst3Dir, `${m.sessionId}-friction-digest.md`));
  }
  console.log(`Wrote ${worst3.length} worst-3 friction digests.`);

  // Deep dive on target session
  if (deepDivePrefix) {
    const target = files.find((f) => path.basename(f).startsWith(deepDivePrefix));
    if (target) {
      writeDeepDive(target, path.join(outDir, "deep-dive-this-session.md"));
      console.log(`Deep dive written for ${path.basename(target)}`);
    } else {
      console.warn(`No transcript file matches prefix '${deepDivePrefix}' — skipping deep dive.`);
    }
  }

  // --mark-reviewed: append this run's session IDs to the ledger.
  if (markReviewed) {
    const ids = allMetrics.map((m) => m.sessionId);
    const added = appendReviewedSessions(ledger, ids);
    console.log(`--mark-reviewed: added ${added} new session(s) to ${path.relative(repoRoot, reviewedLedgerPath)}.`);
  }

  console.log("\nDone. Outputs in:", path.relative(repoRoot, outDir));
}

main();
