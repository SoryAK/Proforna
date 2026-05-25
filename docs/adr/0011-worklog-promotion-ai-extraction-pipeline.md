# 0011 — Worklog Promotion: AI-Assisted Extraction Pipeline

- **Status:** Proposed
- **Date:** 2026-05-25
- **Deciders:** Sory Kaba
- **Tags:** ai, worklog, career-events, privacy, resume

## Context and Problem Statement

Phase D ships a "Promote Notable Worklog → CareerEvent" flow (implemented in `promote-to-event-dialog.tsx`). In its current form the dialog is a glorified form: the user manually types a title, category, description, and metrics before saving. The raw field note is passed through with no transformation.

Field notes are written on the job — casually, quickly, with company-specific jargon, proprietary equipment IDs, internal process names, and photos that may contain identifying or confidential equipment. Promoting that raw content verbatim into a résumé-facing CareerEvent creates two hard problems:

1. **Privacy & policy risk.** Company names, model numbers, and photographs may violate NDA or workplace confidentiality policies when lifted directly into a public or shared résumé.
2. **Resume quality gap.** Field shorthand ("fixed the BL Weigher again, cylinder issue") is not résumé language. The transferable skill ("diagnosed pneumatic actuator failure on loss-in-weight feeder") is implied but never stated. Without extraction and rephrasing the promoted event is as raw as the original note.

## Decision Drivers

- Field workers capture notes in the moment — they shouldn't have to self-edit into résumé prose at write time.
- Transferable skills are implicit in domain-specific notes; a mapping step from equipment/action → skill taxonomy is needed.
- Privacy-by-default: sanitization must happen before content ever reaches a résumé surface.
- The clarification step should feel conversational, not like filling out a long form.

## Considered Options

- **Option A — AI-Assisted Extraction Pipeline (deferred sprint):** Server-side LLM call parses the note, extracts entities, asks targeted follow-up questions, rephrases into action-verb bullets, strips proprietary identifiers, maps to skill nodes, then presents a draft for user approval before saving.
- **Option B — Manual enrichment only (current implementation):** User fills in the form themselves. No AI. Fast to ship, but leaves all the quality and privacy burden on the user.
- **Option C — Auto-promote with no review step:** AI generates the event and saves immediately. Fast but removes human oversight — unacceptable for privacy-sensitive content.

## Decision Outcome

**Chosen option: "Option A — AI-Assisted Extraction Pipeline"**, deferred to a future sprint. Option B remains the live implementation as a usable baseline. Option C was rejected outright (no human-in-the-loop).

### Positive Consequences

- Users capture raw field reality now; AI does the translation work later at promote time.
- Skill taxonomy gets populated automatically from extracted entities rather than relying on manual tagging.
- Privacy protection is systematic, not ad-hoc.

### Negative Consequences

- Requires an LLM integration (AI SDK route handler) — adds infrastructure and API cost per promotion.
- The clarification Q&A loop adds latency to the promote flow; UX must communicate that this is deliberate (not a bug).
- AI extraction quality depends on model context window and domain vocabulary; mechanical/industrial jargon may need a fine-tuned or few-shot prompt.

---

## Detailed Pipeline Design (for implementation sprint)

### Step 1 — Entity Extraction
Send the raw note text (stripped of any embedded image data) to the LLM with a structured extraction prompt:
- Equipment names / model identifiers
- Actions performed (verb phrases)
- Outcomes (what changed, what was restored)
- Collaborators or teams mentioned
- Any numeric data (time to resolve, production rate restored, etc.)

### Step 2 — Sanitization
Replace extracted proprietary identifiers with generic equivalents before any résumé output:
- `"BL Weigher 1"` → `"loss-in-weight feeder"`
- `"Line 3 CLR2 #8-#9"` → `"production line conveyor system"`
- Specific company names → removed or replaced with role context (`"employer's"`)
- Photo metadata / EXIF / any image data → never forwarded; only extracted text is sent

### Step 3 — Targeted Clarification Questions
Based on extracted entities the LLM generates 2–4 follow-up questions surfaced one at a time in the dialog:
- `"What type of cylinder was involved? (e.g. pneumatic, hydraulic, electric)"` → user answers → appended to context
- `"What was the root cause of the failure?"` → user answers → feeds the rephrased bullet
- `"What was the measured impact of the fix?"` → prompts for quantification

### Step 4 — Skill Node Mapping
Answered clarifications feed a second structured prompt that maps to the existing `SkillNode` taxonomy:
- `"pneumatic cylinder"` → `SkillNode: pneumatic_systems`
- `"conveyor belt tracking"` → `SkillNode: conveyor_maintenance`
- `"weigher calibration"` → `SkillNode: instrumentation_calibration`
These are attached to the promoted CareerEvent via `CareerEventSkill`.

### Step 5 — Résumé-Ready Draft Generation
LLM produces a structured draft using the sanitized context + answered clarifications:
```
Title:       Resolved pneumatic actuator failure on loss-in-weight feeder
Category:    milestone
Description: Diagnosed intermittent feed stoppage traced to worn cylinder seals on 
             a loss-in-weight feeder. Replaced actuator assembly and recalibrated 
             feeder parameters, restoring accurate dosing within one shift.
Metrics:     < 4hr MTTR, production throughput restored to spec
Skills:      pneumatic_systems, instrumentation_calibration
```

### Step 6 — Human Review & Edit
The dialog presents the draft in an editable form (same fields as today). User can tweak any field before confirming save. Nothing is written to the database until the user clicks "Save Event".

---

## Boundary Conditions & Rules

| Rule | Rationale |
|---|---|
| Raw photos are NEVER sent to the LLM | Images may contain proprietary equipment labels, faces, or safety-sensitive info |
| Original worklog content is NEVER modified | Promotion is a one-way projection; the source note is the ground truth |
| All LLM calls go through a server-side route handler | API keys never leave the server; client only sees the structured draft response |
| Sanitized draft shown to user before save | Human-in-the-loop is non-negotiable for privacy and accuracy |
| User can always fall back to the manual form | AI failure or refusal should degrade gracefully to Option B behavior |

## Links

- Implements: Phase D promotion flow — `src/components/worklog/promote-to-event-dialog.tsx`
- Related: `src/app/api/work-history/[id]/events/route.ts` (POST endpoint that saves the CareerEvent)
- Skill taxonomy: `prisma/schema.prisma` → `SkillNode`, `CareerEventSkill`
