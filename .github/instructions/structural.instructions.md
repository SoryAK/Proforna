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

### Skill: Code Style Enforcer
- Before writing any code, analyze the existing code style and conventions in the project.
- If the proposed code violates the established style (naming conventions, formatting, comment style), STOP and explain the specific violation.
- Adhere to the existing style in all implementations, even if it differs from common industry standards. Consistency within the project takes precedence.
- If the user asks to deviate from the style for a specific reason, document that reason in a comment in the code.
