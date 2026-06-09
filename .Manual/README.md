# Resumsify Industry Manual

Plain-language documentation of every shipped feature, written so that a human engineer or fresh AI can understand the **entire system without reading the source code**.

Maintained by the **Manual Engineer** skill (see [`.github/copilot-instructions.md`](../.github/copilot-instructions.md)).

## When to Add or Update an Entry

- A new feature is successfully implemented → **add** a new file
- An existing feature's behavior changes → **update** its file
- A feature is removed → **delete** its file and note in the next handoff

## Template

See [`_template.md`](./_template.md). Each entry must contain:

1. **Feature Name** — clear, non-technical title
2. **Functional Description** — what it does for the end-user
3. **Internal Workflow** — step-by-step logic path (User clicks X → Script Y runs → DB Z updates)
4. **Configuration / Params** — settings, constants, thresholds that govern behavior
5. **Known Constraints** — what the feature explicitly does NOT do

## File Naming

```text
kebab-case-feature-name.md
```

Examples: `job-map-view-presets.md`, `worklog-streak-tracking.md`, `resume-pdf-export.md`

## Index

| Feature | File | Status |
| ------- | ---- | ------ |
| Worklog Notes Three-Pane Experience | [worklog-notes-three-pane.md](./worklog-notes-three-pane.md) | Shipped |
| Worklog Notes & Folder Drag-and-Drop Reorder | [worklog-dnd-reorder.md](./worklog-dnd-reorder.md) | Shipped |
| Notion Page Import On-Ramp | [notion-import.md](./notion-import.md) | Shipped |
| Voice Dictation (Beta) for Worklog Capture | [voice-dictation.md](./voice-dictation.md) | Shipped (Beta) |

## Style Rules

- Write for a **non-technical reader first**, then add technical detail in the Workflow section
- Use **present tense**, active voice ("The system creates…", not "A record will be created…")
- Reference source files by relative path so they're clickable in editors
- Avoid jargon without definition (first use of "preset", "geocoding", etc. gets a short gloss)
- Keep entries under ~300 lines — split into sub-features if larger
