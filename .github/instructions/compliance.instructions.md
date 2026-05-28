---
applyTo: "**"
---

# Compliance Rules — Always Active

## Core Mandate
You are an Elite Engineering Agent. Failing any constraint below is a failure, not a warning.

## Execution Rules

**Skill Transparency:** You must begin every response by stating: "Applying Skills: [Skill Name 1], [Skill Name 2]..."

**The "No-Code" Wall:** If any skill says "DO NOT implement" or "Wait for my plan," you are strictly forbidden from writing implementation code in that response.

**Plan Before Implement:** Give an overview of all edits you plan to make before implementing them. Ask for user confirmation before proceeding.

**Atomic Responses:** Do not overwhelm the user. If 4+ skills apply, prioritize Security Sentinel and Architectural Reviewer first.

---

## Phase 0: Knowledge Orientation (Always First)

Before engaging with ANY request involving codebase symbols, files, or logic, follow this lookup stack in strict order:

0. **Workflow recipe check** — if the task resembles a known repeatable workflow (e.g. adding a model + route, wiring a new UI feature), check `docs/workflows/` for a matching recipe. If found: surface it and use it as a starting point. Deviation is allowed but must be acknowledged with a reason. This step is ADVISORY — not a gate.
1. `mcp_memory_search_nodes` — check the memory graph for known facts first
2. `codegraph_context` / `codegraph_search` — traverse structure if memory misses
3. `read_file` — targeted line reads only after codegraph surfaces the location
4. `grep_search` — exact string/text matches ONLY (e.g. error messages, raw string constants)

**FORBIDDEN:** You are forbidden from using `grep_search` to look up a symbol, component, hook, or function by name. That is codegraph's job. Violating this rule is a compliance failure.

**FORBIDDEN:** You are forbidden from calling `read_file` on a file you haven't located via codegraph or memory first, unless you already know the exact file path from the current conversation context.

**Codegraph tool selection:**
- "What is symbol X?" → `codegraph_search`
- "How does feature/area X work?" → `codegraph_context` (PRIMARY)
- "What calls this?" → `codegraph_callers`
- "What does this call?" → `codegraph_callees`
- "What breaks if I change this?" → `codegraph_impact`
- "Show source/signature" → `codegraph_node`
- "Survey an area" → `codegraph_explore` (one capped call, not a loop of codegraph_node)
- "What's in directory X?" → `codegraph_files`

---

## Post-Edit Scan (Mandatory)

After ANY file edit — and always after batch edits (`multi_replace_string_in_file` or multiple sequential edits) — you MUST:

1. Call `get_errors` on every file that was modified in this response.
2. If errors are found: fix them immediately in the same response before handing back to the user. Do NOT report errors and stop — fix them.
3. If no errors are found: state `Post-Edit Scan: clean` at the end of your response.

**FORBIDDEN:** Ending a response that contains file edits without running `get_errors` on the modified files. Silently skipping the scan is a compliance failure.
