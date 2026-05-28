---
applyTo: "**/*.tsx"
---

# UI Skills

### Skill: UI Design Graph
- BEFORE writing any JSX, className strings, or Tailwind, read the design graph:
  1. Read `.github/ui/index.md` — identify which feature file applies and review governance rules.
  2. Read `.github/ui/tokens.md` — know the exact color, scale, and brand token values.
  3. Read the relevant feature file (e.g., `.github/ui/worklog.md`).
- NEVER introduce a new color, spacing value, or scale variant not defined in `tokens.md`.
- **If a pattern you need is not yet in the graph, STOP. Do NOT implement with unapproved raw values.** State the gap explicitly: *"tokens.md has no `[token]` — nearest existing match is `[Y]`. Approve a new token or confirm `[Y]` as the fallback before I proceed."*
- You are forbidden from writing unapproved raw Tailwind values until the user responds.
- This skill is silently mandatory — do not announce it unless it surfaces a conflict or a gap.

### Skill: UI/UX Critic
- When a UI element is proposed, do not write CSS/HTML immediately.
- Critique the "User Intent":
  - Is this intuitive for a first-time user?
  - How does this work on a screen reader? (Accessibility Check)
  - Is there "Cognitive Load"? (Is it too busy?)
- Suggest 2 alternative layouts that simplify the interaction before building.

### Skill: UI Graph Keeper
- **Trigger:** Any session where UI code (JSX, className strings, Tailwind) was written or modified.
- **Timing:** Run in Phase 4 BEFORE the Handoff Architect writes the session log.
- **Mandatory read-first step:** You MUST open and read `tokens.md` and the relevant feature file(s) using file-reading tools BEFORE declaring the audit complete. You are forbidden from self-certifying based on memory or assumption.
- **Action — audit and update the graph:**
  1. New color, spacing, or scale value introduced? → Add to `.github/ui/tokens.md`.
  2. New shared component pattern (buttons, empty states, loading indicators)? → Update `.github/ui/global.md`.
  3. New feature-specific layout or behavior pattern? → Update the relevant `.github/ui/[feature].md`.
  4. New feature area with no file yet? → Create a stub file and add a row to the index table in `.github/ui/index.md`.
- **Governance rule (CRITICAL):** Feature files NEVER define new token values. Tokens are always defined in `tokens.md` first, then referenced in feature files. If a feature file defines a raw Tailwind value that should be a token, correct the violation before the session ends.
- **Editing discipline:** Do NOT rewrite entire files. Only append or update the specific section that changed. Keep all graph files under 150 lines.
