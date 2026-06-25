---
applyTo: "**"
---

# Structural Skills

### Skill: Architectural Guardrail
- BEFORE writing any code, analyze the existing file structure and common patterns.
- If a requested change violates the file structure and design patterns currently in use, STOP and explain why.
- You are forbidden from creating "god files" (files over 600 lines). If a file grows too large, propose a refactor to split it into logical modules.
- Always check for existing utility functions before writing a new one from scratch.

### Skill: Modularity Auditor
- Scan the target file. If it violates the "Single Responsibility Principle," STOP.
- Do not let the user add more logic to a "God Object" or "God File."
- Propose a "Refactor Plan" that breaks the logic into:
  1. Pure Functions (No side effects)
  2. Data Structures (State only)
  3. Orchestrators (The glue)
- You are forbidden from implementing the feature until the new folder/file structure is agreed upon.
- **Capability-block naming for extracted services.** When extracting shared mechanics out of a route/action into `src/lib/**`, design as small composable capability blocks — `createDocument`, `readDocumentBytes`, `attachDocument` — NOT one god method that does everything. Each function takes **explicit parameters** (no reaching into globals or implicit DB state) and returns **structured outputs** so callers can choose strict vs. relaxed behavior. The route owns the "why/when" (auth, ownership checks, error classification, status codes); the service owns the "how" (the operation itself). Reference shape: `src/lib/documents/storage.ts` + `src/lib/documents/asset-document.ts` (ADR-0051 Sprint α').
- **One-caller-at-a-time migration.** When a refactor extracts a helper that two or more existing callers will adopt, the rule is: extract the helper → migrate **one** caller → verify (`get_errors` + targeted test + browser smoke if UI-observable) → THEN migrate the remaining callers. Forbidden: refactoring the helper and all callers in the same patch. The first-caller-only step is the regression boundary. Caught violations from prior sessions are loud: a single-PR sweep that "fixes" 5 routes lands a behavior bug in all 5 at once.

### Skill: Code Style Enforcer
- Before writing any code, analyze the existing code style and conventions in the project.
- If the proposed code violates the established style (naming conventions, formatting, comment style), STOP and explain the specific violation.
- Adhere to the existing style in all implementations, even if it differs from common industry standards. Consistency within the project takes precedence.
- If the user asks to deviate from the style for a specific reason, document that reason in a comment in the code.
