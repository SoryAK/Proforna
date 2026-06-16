# Structured Procedure Documents

- **Status:** Accepted (2026-06-15)
- **Date:** 2026-06-15
- **Deciders:** Sory
- **Tags:** worklog, procedures, runbooks, tiptap, prosemirror, knowledge-graph
- **Related:** [ADR-0029](./0029-worklog-procedures.md) (procedure as kind of worklog — v1), [ADR-0010](./0010-tiptap-yjs-worklog-editor.md) (editor stack), [ADR-0017](./0017-worklog-version-history-and-visual-diff.md) (version history), [ADR-0016](./0016-note-to-note-linking-and-backlinks.md) (mention pattern), [ADR-0028](./0028-persona-contact-reverse-lookup.md) (cross-cut backlinks recipe)

## Context and Problem Statement

ADR-0029 v1 shipped procedures as a kind-discriminated `WorkLog` row. Procedures and notes share **the exact same blank-canvas Tiptap editor**. The user reports — correctly — that this makes procedures feel like "notes that happen to have steps in them" rather than purpose-built runbooks.

A note is a **journal entry**: timestamped, free-form, "what happened today." A procedure is a **runbook**: purpose-driven, ordered, "how to do X."

The user's worked example:

> Title: *How to open a box*
>
> **Tools & Equipment**: pry-bar, gloves, safety glasses (each chip-linked to assets, with images)
>
> **Step 1 — Inspect the box** (text + photo of the box + an annotated diagram callout)
>
> **Step 2 — …**
>
> Properties rail (NEW): "Linked procedures" section. *If box is in a machine → follow `Lockout-tagout` first. Else → continue here.* Each link is an explicit edge with a relationship type, not just an inline `@r:` mention.

The shape has **named slots the user fills in**, not a blank canvas they have to organize themselves. The freeform-Tiptap-document model from ADR-0010 (which is correct for notes) is the wrong shape here.

## Decision Drivers

- **Earn the separate `kind`.** Today, procedure-vs-note is invisible at the editor level. The discriminator only manifests in the list view. A document shape unique to procedures justifies the kind separation.
- **Convergent design.** Every real-world runbook system (Ansible playbooks, GitHub Actions workflows, Notion runbook templates, paper checklists) has named slots: prerequisites + steps + conditional branches. The user is rediscovering an industry-wide pattern.
- **Match the user's ADHD usage profile.** A blank canvas with "remember to write tools at the top, then steps with images" is exactly the wrong UX for someone who needs the structure to be the thing that scaffolds the writing — not a discipline they impose on a blank doc.
- **Knowledge graph is one join-table away.** Once procedures have first-class structural links to other procedures (prereq, branch, next), runbooks form a directed graph that can be traversed and visualized. This is a **10× feature for ~50 lines of model**.
- **Reuse what works.** Mentions (ADR-0016), version history (ADR-0017), images, autosave, archive, search (ADR-0011 tsvector) all already work on `WorkLog.contentJson`. A structured schema is still a ProseMirror document — these features keep working with zero changes.

## Non-Goals (parked for v2+)

- **Per-run state ("template + instance" model).** The user explicitly parked this — checkbox state lives in the document itself for v1, not in a separate `ProcedureRun` table. ADR-0030 is about document **shape**, not document **execution**.
- **Custom block-editor with drag-to-reorder.** Tiptap node primitives are sufficient. No Notion-style draggable blocks for v1; that's a UX polish sprint of its own.
- **Step-aware version diff.** ADR-0017 diffs work on the flat `contentJson` ProseMirror tree. They will keep working. A "Step 2 changed" diff view is desirable but a v2 polish — not a v1 blocker.
- **Migrating existing v1 procedures.** Will be addressed at the end (data-preserving wrap of existing freeform body into a single `procedureStep` named "Body").

## Considered Options

### Option A — Custom Tiptap document schema (`procedureDoc` top-level node)

Define a custom ProseMirror schema for `kind=procedure` documents. The top-level document node is `procedureDoc`, with a strict child sequence:

```
procedureDoc:
  procedureTitle        (1, plain text)
  procedureTools?       (0..1, holds @a: chips, images, short text)
  procedureStep         (1..N, each step has its own body of mixed content)
```

The editor enforces shape via Tiptap's `parseHTML`/`renderHTML` + a custom node spec with a tight `content` expression. Pasting body content outside a step auto-wraps it into a new step. Toolbar adds an "+ Add step" button.

When the editor mounts, it inspects the document's `kind`:
- `kind === "note"` → existing notes schema (StarterKit + extensions) — unchanged.
- `kind === "procedure"` → procedure schema (StarterKit subset + procedure node specs).

Mentions, images, version history all reuse the existing extensions — they work *inside* `procedureStep` and `procedureTools` content.

### Option B — Soft convention via Tiptap headings/lists (no schema enforcement)

Document a convention: "Procedures should start with `# Tools` then `## Step 1`, `## Step 2`, …" and lean on the existing notes editor. Add toolbar shortcuts to insert these heading blocks. No schema enforcement — the user could break the convention at any time.

### Option C — Form-based procedure editor (no Tiptap)

Replace the editor entirely for procedures with a structured form: title input, dynamic tools-list builder, repeating step sections each with their own small Tiptap instance for the step body.

### Option D — Wait, ship something else first

Defer this entirely. Notes-as-procedures works at the data layer; the user can manually structure them with markdown until they want this.

## Decision

**Recommended: Option A — custom Tiptap document schema.**

Reasoning:

1. **Schema in the document model is the only place where structure becomes durable.** A convention (Option B) gets violated within a week and the data is forever ambiguous. A form (Option C) throws away every Tiptap feature the user already loves (mentions, autosave, version history, photos, paste-from-anywhere).
2. **The schema *is* the UX.** The user's described shape (title → tools → steps) is non-negotiable. Encoding it in the document model means the editor toolbar can show *exactly the slots that exist*, no clutter.
3. **The cost is bounded.** Custom Tiptap nodes are well-documented; image/mention/history extensions plug in unchanged. The hard part is the parse/render rules and the paste handling — measurable and capped.
4. **Procedure-to-procedure links are a separate, additive feature.** They live in a `ProcedureLink` table and surface in the properties rail — not part of the document. We can decide to ship that in the same milestone or split it; the document schema doesn't depend on it.

### Positive Consequences

- Procedures get a purpose-built editing surface that matches their information shape.
- The "+ Add step" button is the entire onboarding for the structure — no documentation needed.
- All cross-cutting features (mentions, version history, search, archive, asset-cross-cut) keep working without changes.
- Ground truth for future: "step numbering," "reorder steps," "step-aware diff" — each becomes a localized polish change, not a redesign.
- ProcedureLink table opens the door to a runbook DAG without touching the document model.

### Negative Consequences

- Tiptap custom schemas are non-trivial. Realistic v1 build: **2–4 days of focused work** for the editor, paste rules, toolbar, and tests. (Bigger than the average ADR-0029 unit.)
- Existing procedure rows from ADR-0029 v1 need a one-time migration. The migration is data-preserving (wrap freeform body into a single step named "Body") but it's a real operation with a real risk surface.
- The notes/procedures editor split means two schemas to maintain. Bug-fixes to a shared extension touch two mounts.
- Markdown export (`prosemirror-to-markdown`) needs awareness of the new node types or will silently drop them.

## Pros and Cons of the Options

### Option A — Custom Tiptap document schema

- ✅ Structure is enforced, not optional. Data stays clean.
- ✅ Editor surface matches the mental model exactly (named slots).
- ✅ Everything reusable (mentions, images, history, autosave) keeps working.
- ✅ ProcedureLink table is additive — does not depend on the schema work.
- ❌ Real engineering effort (2–4 days). Bigger than any ADR-0029 unit.
- ❌ Markdown export needs new render rules for `procedureStep` / `procedureTools`.
- ❌ Migration of v1 procedures required (data-preserving but non-trivial).

### Option B — Soft convention via headings

- ✅ Zero engineering. Just a toolbar shortcut for "insert step heading."
- ❌ The user said the structural problem is real. Convention is the same as no structure — it gets broken.
- ❌ Search and cross-cut features can't lean on structure that isn't in the data.
- ❌ Doesn't earn the separate `kind`. Procedures still feel like notes.

### Option C — Form-based editor

- ✅ Structure is unambiguous: each field is its own DB-shaped slot.
- ❌ Loses Tiptap mentions, paste-anywhere, version history (or requires re-implementing them per-field).
- ❌ Step body still needs a rich editor inside the form, so we end up with N small Tiptap instances anyway. Worst of both worlds.
- ❌ Doesn't fit the existing ADR-0010 stack at all.

### Option D — Defer

- ✅ Zero immediate cost.
- ❌ The user just told you the v1 procedure UX feels half-finished. Deferring means he keeps using procedures wrong or stops using them.
- ❌ The longer v1 procedures accumulate as freeform docs, the bigger the migration becomes when we eventually do this.

## Locked Decisions (resolved 2026-06-15)

The following three shape questions cascaded into ~50% of the schema and editor work. They were resolved by user decision before this ADR moved out of Proposed status:

### L1. Tools & Equipment block is **optional**.

The user can add or remove the tools block. Editor shows a "+ Add tools" affordance when the block is missing. Procedures genuinely vary on whether tools apply (an SOP for "How I run my weekly retro" has none; "Lockout-tagout" has many).

### L2. Steps use **both** auto-numbering and optional user titles.

Each `procedureStep` has an optional `title` attribute. The step number is **always** auto-rendered from sibling index — reordering renumbers automatically. If `title` is set, the step renders as `Step 3 — Inspect the box`; if not, it renders as `Step 3`.

### L3. Steps are a **flat list**.

No nested sub-steps. `procedureDoc.content = "procedureTitle procedureTools? procedureStep+"` is the full nesting. Cross-procedure branches use `ProcedureLink` (e.g. *"if box is in a machine → follow `Lockout-tagout` first"*). Deep conditional logic inside one procedure is treated as a smell that wants to be a separate procedure.

## Schema sketch (locked per L1–L3)

ProseMirror node specs (informal):

```
procedureDoc:
  content: "procedureTitle procedureTools? procedureStep+"
  // top-level enforced shape (L1: tools optional, L3: steps are a flat list)

procedureTitle:
  content: "text*"
  // single-line, no marks, plain text

procedureTools:
  content: "block+"
  // accepts paragraphs with @a: mentions, images, short text
  // visually a chip cloud + freeform body, NOT a numbered enumeration

procedureStep:
  attrs: { title: string | null }   // L2: user title is optional
  content: "block+"
  // accepts paragraphs, images, mentions, lists, code blocks (NO nested
  // procedureStep — flat per L3)
  // step number is always computed from sibling index at render time
  // renders as "Step N" when title is null, "Step N — <title>" when set
```

`ProcedureLink` Prisma model (separate, additive):

```prisma
model ProcedureLink {
  id                String   @id @default(uuid())
  fromProcedureId   String
  toProcedureId     String
  relationship      String   // "prereq" | "branch" | "next" | "related"
  note              String?  // free-form: "if box is in a machine"
  createdAt         DateTime @default(now())

  fromProcedure     WorkLog  @relation("ProcedureLinkFrom", fields: [fromProcedureId], references: [id], onDelete: Cascade)
  toProcedure       WorkLog  @relation("ProcedureLinkTo",   fields: [toProcedureId],   references: [id], onDelete: Cascade)

  @@unique([fromProcedureId, toProcedureId, relationship])
  @@index([fromProcedureId])
  @@index([toProcedureId])
}
```

(The relation arrows let the properties rail render both directions: "this procedure is a prereq for…" and "prereqs of this procedure are…")

## Migration strategy (v1 → v2)

For each existing `WorkLog` with `kind = "procedure"`:

1. Take the current `contentJson` (a freeform ProseMirror doc).
2. Wrap it as the body of a single `procedureStep` named "Body."
3. Synthesize an empty `procedureTitle` from the existing `WorkLog.title` field.
4. No `procedureTools` block (Q1: optional).
5. Save as the new structured shape.

Reversible: the wrapped step's body is the original document verbatim. If we ever need to roll back, unwrap.

Idempotent: detect already-migrated docs by inspecting the top-level node type. Re-running is a no-op.

## Implementation outline (rough — a real plan comes after Q1–Q3 lock)

Approximate units, in dependency order:

1. **Schema spec + node types** (Tiptap node definitions for `procedureDoc`, `procedureTitle`, `procedureTools`, `procedureStep`).
2. **Editor mount switching** — when loading a worklog, branch on `kind` to mount the right schema.
3. **Toolbar** — "+ Add step", "+ Add tools" (if Q1 = optional), step reorder.
4. **Paste rules** — content pasted outside a step gets wrapped into a new step.
5. **Migration script** — one-time, idempotent, dry-run-able.
6. **Markdown export** — render rules for `procedureStep` and `procedureTools`.
7. **Properties rail: linked procedures** (NEW `ProcedureLink` table, list + add UI).
8. **Tests** — schema validation, paste handling, migration round-trip, link CRUD.

Plus tests for everything (TDD per `testing.instructions.md`).

## Risks

- **Tiptap schema strictness can fight paste behavior.** If the schema is too tight, paste-from-anywhere becomes painful. The paste rule must be lenient enough to wrap arbitrary content into a new step rather than rejecting it.
- **Version history diff readability.** Diffs against a structured doc still work, but readability suffers if the diff renderer doesn't know about the new node types. Acceptable for v1; polish later.
- **Markdown round-trip lossiness.** ADR-0022 markdown round-trip will need explicit rules for the new node types or will lose the structure on export. Plan to add render rules in the same milestone.
- **Editor mount split bugs.** Two schemas mean two code paths. Mitigated by: shared extensions (mentions, images, history) live in one place and plug into both schemas.

## Links / References

- [ADR-0029 — Worklog Procedures (Runbooks)](./0029-worklog-procedures.md) (v1 — kind discriminator)
- [ADR-0010 — Tiptap + Y.js worklog editor](./0010-tiptap-yjs-worklog-editor.md)
- [Tiptap custom node guide](https://tiptap.dev/docs/editor/api/schema)
- [parked-ideas item #6](../../memories/repo/parked-ideas.md) — "Procedure-specific UI primitives"
- [parked-ideas item #7](../../memories/repo/parked-ideas.md) — "Procedure events / runs" (v2+, expressly out of scope here)
