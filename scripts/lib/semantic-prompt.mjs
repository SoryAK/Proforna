/**
 * Semantic-review prompt + Ollama caller for ADR-0047 Column 2 verify stage.
 *
 * Used by scripts/review-semantic.mjs. Kept separate from the orchestrator so
 * future prompt iterations (Column 2 categorize/act stages, additional verify
 * modes) are single-source and diffable in isolation.
 *
 * Validated 2026-06-23 against worklog-editor slice trap[0] in both directions:
 *   - Live file              -> stillValid=true  (positive control)
 *   - Fake-patched deps fix  -> stillValid=false (negative control)
 *
 * Promotion provenance: scripts/_stage1-prompt.mjs (deleted post-validation).
 */

const OLLAMA_URL = "http://localhost:11434/api/generate";
const MODEL = "gemma4:26b";

export function numberLines(src) {
  return src
    .split(/\r?\n/)
    .map((line, i) => `${String(i + 1).padStart(4, " ")}  ${line}`)
    .join("\n");
}

export function buildVerifyPrompt({ slice, entryPointId, trapText, filePath, fileNumbered }) {
  return `You are a senior code reviewer auditing whether a slice manifest trap STILL describes a real risk in the current code.

CONTEXT
A "slice manifest trap" claims that a specific code pattern creates a specific risk. Your job is to compare the CLAIM against the ACTUAL code and mark the claim still-valid ONLY if the code structurally matches.

CRITICAL BIAS
A false positive (marking a FIXED trap as still-valid) is MUCH worse than a false negative. When in doubt, mark stillValid=false. Your default position is "the code may have been refactored since this trap was written". Do not let the trap text talk you into validating it — verify each structural claim against the code.

SLICE: ${slice}
ENTRY POINT: ${entryPointId}

TRAP CLAIM (verbatim from manifest):
${trapText}

CURRENT FILE: ${filePath}
FILE CONTENT (1-indexed line numbers prefixed):
${fileNumbered}

REASONING PROCEDURE (you must follow this order before producing the verdict)
STEP 1 — Extract 2-4 concrete STRUCTURAL CLAIMS from the trap text.
   Each claim must be a single verifiable assertion about the code, e.g.:
   - "the dependency array is []"
   - "the cleanup function reads the React state \`value\` directly (not through a ref)"
   - "the equality check is against lastCommittedRef.current"
STEP 2 — For each structural claim, locate the corresponding code in the FILE CONTENT and decide matchedInCode=true/false with a cited line.
STEP 3 — stillValid=true ONLY IF ALL checklist items have matchedInCode=true. If ANY claim does not match, stillValid=false.

OUTPUT FORMAT (JSON only, no prose, no markdown fences):
{
  "comparisonChecklist": [
    { "claim": "<one structural claim>", "matchedInCode": true | false, "lineRef": <int>, "note": "<short anchor: 1 line>" }
  ],
  "stillValid": true | false | "ambiguous",
  "evidence": "<2-4 sentences justifying the verdict, citing the checklist>",
  "citedLines": [<int>, <int>],
  "category": "mechanical" | "semantic" | "ambiguous"
}

RULES
- comparisonChecklist must contain AT LEAST 2 items.
- stillValid=true is FORBIDDEN unless every checklist item has matchedInCode=true.
- citedLines must be REAL line numbers from the FILE CONTENT above.
- category: "mechanical" if the fix is a small code change (deps array, ref refactor); "semantic" if it needs architectural rework; "ambiguous" if you cannot judge.
- No text outside the JSON object.`;
}

export async function callOllama(prompt, { timeoutMs = 120000 } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const body = {
    model: MODEL,
    prompt,
    format: "json",
    stream: false,
    // num_ctx must be large enough to hold prompt + numbered file + response.
    // Empirical (2026-06-23): an 8192 ctx overflowed silently on a 610-line
    // primaryPath file — gemma4 returned ~empty JSON ('{"') in <1.5s for all
    // 4 traps because no context was left to generate. 16384 handles files up
    // to ~1200 lines comfortably and fits in the iGPU's 64GB unified memory.
    // num_predict caps the response side to prevent runaway generation loops
    // (one trap previously hung indefinitely without a cap).
    options: { temperature: 0.1, num_ctx: 16384, num_predict: 2000 },
  };
  const t0 = Date.now();
  try {
    const res = await fetch(OLLAMA_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Ollama HTTP ${res.status}: ${text}`);
    }
    const json = await res.json();
    return { response: json.response, elapsedMs: Date.now() - t0, model: MODEL };
  } finally {
    clearTimeout(timer);
  }
}

export { MODEL };
