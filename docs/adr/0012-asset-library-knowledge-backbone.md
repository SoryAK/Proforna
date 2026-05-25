# 0012 — Asset Library as Knowledge Backbone

- **Status:** Proposed
- **Date:** 2026-05-25
- **Deciders:** Sory Kaba
- **Tags:** assets, knowledge-graph, procedures, ai, schema, worklog

## Context and Problem Statement

The current `JobAsset` model is a site-specific *instance record* — it captures "BL Weigher 1 at Barry Callebaut" with name, manufacturer, serial number, photos, and location. It is effectively a label with no knowledge attached.

The worklog is already a powerful documentation tool, but it exists in isolation. Notes reference assets via a raw `assetIds` string array — there is no reverse lookup ("all notes that touched this machine"), no linked manuals, no linked procedures, no skill taxonomy connection. Every troubleshooting event starts from zero.

The user's mental model of their work follows a repeatable cycle:

```
Encounter Problem → Observe & Document (worklog)
  → Research (missing)
  → Experiment (unstructured)
  → Solution
  → Repeatable Procedure (missing)
  → Career Proof (career event)
```

The Asset Library is the stable reference layer that connects all of these phases. Without it, each phase is an island. With it, the system becomes intelligent — a new problem on a known asset immediately surfaces its history, manuals, prior procedures, and skill context.

This ADR also lays the groundwork for the AI extraction pipeline (ADR-0011): the AI can only recognize that "BL Weigher" is a loss-in-weight feeder, suggest the right skill nodes, and propose a procedure template if the Asset Type Profile exists as a queryable knowledge source.

## Decision Drivers

- Field workers troubleshoot the same classes of equipment across multiple employers — transferable knowledge should accumulate, not reset per job
- The AI (ADR-0011) needs a stable domain vocabulary layer to map raw note language to skill taxonomy without hallucinating
- Privacy: generic type profiles are safe to reference in résumé output; site-specific instance details (serial numbers, company-assigned IDs) are not
- Each sprint must deliver standalone value — the library should be useful before AI integration exists

## Considered Options

- **Option A — Asset Type + Instance inheritance (chosen):** A generic `AssetType` (e.g. "Loss-in-Weight Feeder") holds class-level knowledge. `JobAsset` instances inherit from a type and only add site-specific overrides. Documents, procedures, and skill links live primarily on the type, with instance-level overrides allowed.
- **Option B — Flat enriched instance only:** Add documents, links, and procedures directly to `JobAsset` with no type layer. Simpler schema, but knowledge doesn't transfer across employers and the AI has no class vocabulary.
- **Option C — External knowledge base only:** Use a third-party CMMS or equipment database as the type layer. Eliminates build cost but creates vendor dependency, no offline support, and no customization for the user's specific trade vocabulary.

## Decision Outcome

**Chosen option: "Option A — Asset Type + Instance inheritance"**, because the type layer is the prerequisite for both cross-employer knowledge accumulation and AI vocabulary grounding. Option B was rejected because it recreates the same knowledge from scratch per employer — exactly the problem being solved. Option C was rejected due to vendor lock-in and the impossibility of covering niche industrial trades.

### Positive Consequences

- Equipment knowledge accumulates across employers — "I've worked on 6 loss-in-weight feeders" becomes a provable statement
- AI extraction (ADR-0011) gains a stable vocabulary without requiring fine-tuning
- Procedure library is anchored to asset types — SOPs become reusable across jobs
- Privacy boundary is natural: type profiles are generic (safe for résumé), instances are private (site-specific)

### Negative Consequences

- Schema migration is non-trivial: new `AssetType`, `JobAssetDocument`, `JobAssetLink`, `AssetSkill`, `Procedure`, `ProcedureStep` models required
- UI complexity increases: Asset detail page must show both inherited (type-level) and instance-level data clearly
- Type taxonomy seeding required — an empty type library forces users to create types manually until a seed dataset exists

---

## Data Model Design

### New: `AssetType` (generic equipment class)
```
AssetType {
  id            String   @id
  userId        String                        // user-created types; global seed types use system userId
  name          String                        // "Loss-in-Weight Feeder", "Pneumatic Cylinder"
  category      String                        // machine | vehicle | system | component | tool | structure
  description   String?
  manufacturer  String?                       // if type is manufacturer-specific
  tags          String[] @default([])
  isPublic      Boolean  @default(false)      // future: community-shared type profiles
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt

  instances     JobAsset[]
  documents     AssetDocument[]              // manuals, spec sheets at the type level
  links         AssetLink[]                  // external URLs at the type level
  skills        AssetSkill[]                 // skill taxonomy mappings
  procedures    Procedure[]                  // SOPs that apply to this type
}
```

### Modified: `JobAsset` (site-specific instance)
Add to existing model:
```
  assetTypeId   String?                      // optional link to AssetType for knowledge inheritance
  documents     AssetDocument[]              // instance-specific manuals (overrides/supplements type)
  links         AssetLink[]                  // instance-specific links
  procedures    AssetProcedure[]             // instance-specific procedure links
  skills        AssetSkill[]                 // instance-specific skill overrides
  parentId      String?                      // self-relation: cylinder is a child of a conveyor system
  children      JobAsset[]  @relation("AssetChildren")
  parent        JobAsset?   @relation("AssetChildren", fields: [parentId], references: [id])
```

### New: `AssetDocument`
```
AssetDocument {
  id            String
  assetTypeId   String?   // set if type-level document
  assetId       String?   // set if instance-level document
  docType       String    // manual | wiring_diagram | spec_sheet | safety_sheet | parts_list | other
  title         String
  filePath      String?   // uploaded PDF
  url           String?   // external link (manufacturer site)
  notes         String?
  createdAt     DateTime
}
```

### New: `AssetLink`
```
AssetLink {
  id            String
  assetTypeId   String?
  assetId       String?
  url           String
  title         String
  linkType      String    // supplier | video | forum | article | other
  notes         String?
  createdAt     DateTime
}
```

### New: `AssetSkill` (asset type ↔ skill node mapping)
```
AssetSkill {
  id            String
  assetTypeId   String?
  assetId       String?
  skillNodeId   String
  relation      String    // requires | demonstrates | related
}
```

### New: `Procedure` (repeatable SOP — see also ADR-0013)
```
Procedure {
  id              String
  userId          String
  title           String
  problemStatement String?
  assetTypeId     String?      // procedures belong to an asset type
  estimatedMinutes Int?
  difficulty      String?      // beginner | intermediate | advanced
  tags            String[]
  isPublic        Boolean
  createdAt       DateTime
  updatedAt       DateTime

  steps           ProcedureStep[]
  sourceLogs      ProcedureWorkLog[]   // worklogs that informed this procedure
  assetLinks      AssetProcedure[]
  skills          ProcedureSkill[]
}

ProcedureStep {
  id              String
  procedureId     String
  sortOrder       Int
  title           String
  body            String          // rich text (Tiptap JSON)
  expectedOutcome String?
  warningNote     String?
  tools           String[]        // tool names or EquipmentItem IDs
  photos          ProcedureStepPhoto[]
}

ProcedureWorkLog {
  procedureId   String
  workLogId     String
  // join: this worklog was the source material for this procedure
}
```

---

## Architectural Rules

| Rule | Rationale |
|---|---|
| Type-level knowledge is never private by default | Generic equipment knowledge has no PII — it should accumulate toward a community seed |
| Instance-level data is always private | Serial numbers, customer names, site identifiers must never surface in résumé output |
| Documents/Links exist at BOTH type and instance level | Type: manufacturer manual. Instance: site-specific wiring diagram. Both are useful; neither overwrites the other |
| `assetIds` on WorkLog stays as-is | Migration only adds the reverse relation and UI; existing data is untouched |
| Procedures are anchored to AssetType, not instances | A procedure for "Loss-in-Weight Feeder cylinders" applies at Barry Callebaut AND Giant Direct AND anywhere else |
| Parent/child asset relations are optional, single-level for v1 | Full tree is complex; one level (system → component) covers 90% of real-world cases |

---

## Worklog Integration

The existing `assetIds: String[]` field on `WorkLog` is already the link. The enhancement is:

1. **Reverse query**: "All worklogs that reference Asset X" — powered by the existing `assetIds` array lookup
2. **Asset history tab**: On the `JobAsset` detail page, list all worklogs that reference `this.id`, grouped by date — becomes a full service/maintenance history automatically
3. **Contextual panel in worklog reader**: When a note has `assetIds`, show a side-panel with the asset's type profile, last 3 procedures, and any relevant manuals — no extra action required from the user

---

## Sprint Sequence

### Sprint 1 — Asset Library Foundation
- `AssetType` model + migration
- `AssetDocument` + `AssetLink` models + migration
- `assetTypeId` on `JobAsset` + `parentId` self-relation + migration
- Asset detail page: type profile, documents tab, links tab, worklog history tab
- Asset type picker when creating/editing a `JobAsset`

### Sprint 2 — Procedures
- `Procedure`, `ProcedureStep`, `ProcedureWorkLog`, `ProcedureSkill` models
- Procedure creation UI (step editor using Tiptap blocks)
- "Crystallize to Procedure" fork in the promote dialog (alongside "Promote to Career Event")
- Asset detail page: Procedures tab

### Sprint 3 — AI Integration
- Type recognition in worklog note analysis (ADR-0011 Step 1 enhancement: lookup `AssetType` before extracting)
- Pattern surfacing: "You have 6 worklogs on loss-in-weight feeders across 3 employers"
- Procedure suggestion: "This problem matches Procedure #4 — use as template?"
- Auto skill node population from `AssetSkill` links on the associated type

---

## Links

- Supersedes nothing; extends: ADR-0011 (AI extraction pipeline needs this as vocabulary layer)
- Related: `prisma/schema.prisma` → `JobAsset`, `JobAssetPhoto`, `SkillNode`
- Future ADR: `0013-procedure-model-and-sop-editor.md` (Procedure sprint design detail)
