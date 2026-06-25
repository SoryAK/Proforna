# 0051 — Document substrate as canonical file store

- **Status:** Accepted
- **Date:** 2026-06-25
- **Deciders:** Sory
- **Tags:** schema, documents, files, knowledge-base, refactor, foundation, sovereignty

## Context and Problem Statement

Resumsify today stores user-uploaded files across **four parallel models**, each with its own storage shape, role metadata, and access patterns:

| Model | Stores | Scope | Storage shape |
| --- | --- | --- | --- |
| `Document` | Any user file | User-scoped, polymorphic via `entityType`/`entityId`, foldered | `data String` (base64 inline) |
| `AssetDocument` | Manuals, wiring diagrams, spec sheets, parts lists | XOR-coupled to `AssetType` (cross-employer) or `JobAsset` instance | `filePath String?` (disk) or `url` |
| `EquipmentResource` | Legacy manuals/files | Position-scoped via legacy `Equipment` model | `fileData Bytes?` (Postgres inline) or `url` |
| `Attachment` | Offer letters, W2s, contracts, certs, reviews | Position-scoped (`WorkHistory`) | `filePath String` (disk under `/uploads/attachments/`) |

This duplication blocks several adjacent features:

- The parked equipment manuals KB (now scoped as ADR-0050) wants one
  file-extraction-and-retrieval pipeline; without a unified substrate the
  pipeline has to be re-implemented per model.
- The existing `/docs` page (Drive-style folder UI) only sees `Document` rows —
  manuals stored in `AssetDocument` are invisible to the canonical "all my
  files" surface.
- Future doc-AI features (resume parsing, certification exam prep grilling,
  learning material indexing) would each grow their own extractor + index,
  repeating the same logic.
- `Document.data String` (base64 inline) is fine for resumes (~200 KB) but
  breaks at the file sizes anticipated by the manuals KB (50–500 MB service
  manuals → ~660 MB base64 in a Postgres row).

The unifying insight: **a file's bytes belong in one canonical model; the
file's *role* in any given entity belongs in a strong-typed pivot table.** A
manual is not *owned by* an Equipment — a Document plays the role of "manual"
for an asset, and the same Document might play other roles for other entities.

This ADR establishes that foundation before ADR-0050 builds the manuals KB on
top of it. Sovereignty was already locked in earlier conversation (we
rejected NotebookLM and metadata-only "lean" paths because of third-party
reliance) — owning the pipeline requires owning a hardened file substrate.

## Decision Drivers

- **Data sovereignty (already decided)** — the manuals KB will not rely on
  third-party document services (NotebookLM, Document Intelligence). Owning
  the pipeline requires owning a hardened file substrate.
- **DRY pipeline** — extraction, search indexing, processing state belong to
  "files," not to any one role. Building them once on `Document` benefits
  every future consumer.
- **Referential integrity** — strong-typed pivots beat polymorphic
  `entityType`/`entityId` (the existing pattern has no FK enforcement). New
  pivots get real FKs to both the parent entity and the Document.
- **Backward compatibility** — `/docs` page and existing `Document` /
  `AssetDocument` / `EquipmentResource` / `Attachment` consumers must keep
  working. Migration is **lazy**, not big-bang.
- **Scope discipline** — this ADR only establishes the substrate. ADR-0050
  builds manuals KB on top. Photo tables stay separate (different
  affordances). Equipment → JobAsset migration stays separate.

## Considered Options

- **Option α (rejected): pure polymorphic** — drop `AssetDocument`, move
  everything into `Document.entityType + entityId`. *Rejected* because: no
  Postgres FK enforcement; cannot express many-to-many (same manual covers
  multiple AssetTypes); role metadata (`docType: "manual"`) belongs on the
  *relationship*, not the document.
- **Option β (chosen): Document as file substrate + role-bearing pivot
  tables** — `Document` gains big-file storage + processing pipeline.
  `AssetDocument` / `Attachment` gain a nullable `documentId` FK; their
  existing `filePath` / `url` fields become legacy / external-link slots. The
  pipeline lives on `Document` and benefits every consumer.
- **Option γ (rejected): leave the schema as-is, build manuals KB on
  `AssetDocument` directly** — fastest for one sprint, but entrenches the
  four-parallel-stores anti-pattern and forces every future doc-AI feature to
  either duplicate the pipeline or refactor under more pressure. Throwaway
  compounds.

## Decision Outcome

### Chosen option: β — Document as canonical file substrate

`Document` gets upgraded to be production-ready for large files and AI
processing. Schema delta (new fields marked `// NEW`, legacy fields preserved):

```prisma
model Document {
  id               String   @id @default(uuid())
  userId           String
  name             String
  fileName         String
  fileSize         Int
  mimeType         String
  data             String?         // LEGACY — kept for small inline rows; new uploads use filePath. Nullable to allow disk-backed rows.
  filePath         String?         // NEW — disk path under /uploads/documents/<userId>/<id>.<ext>
  contentHash      String?         // NEW — sha256 of bytes, indexed for future dedup
  pageCount        Int?            // NEW — populated post-extraction (PDFs, DOCX)
  processingStatus String   @default("pending")  // NEW — pending | processing | ready | failed | skipped
  processedAt      DateTime?       // NEW
  extractionError  String?         // NEW — error message when processingStatus = "failed"
  markdownContent  String?         // NEW — extracted text projection for AI / search
  searchVector     Unsupported("tsvector")? @map("search_vector")  // NEW — GENERATED STORED tsvector over markdownContent
  category         String   @default("other")
  entityType       String?         // LEGACY — kept for backward compat; new associations go through pivot tables
  entityId         String?         // LEGACY — same
  notes            String?
  folderId         String?
  createdAt        DateTime @default(now())

  user   User            @relation(fields: [userId], references: [id], onDelete: Cascade)
  folder DocumentFolder? @relation(fields: [folderId], references: [id], onDelete: SetNull)

  @@index([userId, folderId])
  @@index([userId, processingStatus])   // NEW — for background workers polling pending docs
  @@index([contentHash])                 // NEW — for future dedup lookups
}
```

Storage routing rule: at the service layer, files **≤ 256 KB** may remain in
`Document.data` (inline base64) for backward compatibility with existing
resume-sized rows; new uploads above that threshold write to `filePath` on
disk and leave `data = null`. The threshold is a tunable constant; rationale
lives in `src/lib/documents/storage.ts`.

`AssetDocument` (and `Attachment` in a follow-up patch) gains a nullable
`documentId` FK:

```prisma
model AssetDocument {
  id          String   @id @default(uuid())
  assetTypeId String?
  assetId     String?
  documentId  String?           // NEW — points to canonical Document
  docType     String   @default("manual")
  title       String
  filePath    String?           // LEGACY — kept for existing rows during lazy migration
  url         String?           // External URL (manufacturer site, Google Drive)
  notes       String?
  createdAt   DateTime @default(now())

  assetType AssetType? @relation(fields: [assetTypeId], references: [id], onDelete: Cascade)
  asset     JobAsset?  @relation(fields: [assetId], references: [id], onDelete: Cascade)
  document  Document?  @relation(fields: [documentId], references: [id], onDelete: SetNull)

  @@index([assetTypeId])
  @@index([assetId])
  @@index([documentId])
}
```

New uploads write both rows together: `Document` for the bytes, `AssetDocument
{ documentId, docType, ... }` for the role. Existing `AssetDocument.filePath`
rows continue to work unchanged; backfill into `Document` happens lazily on
first access (or via an explicit one-shot script — deferred to a follow-up
patch, not gating ADR-0050).

## Relationship to `/docs` UI (My Docs) and Backward Compatibility

`Document` is not just a substrate — it already powers a user-facing **My Docs**
library at `/docs` (Drive/OneDrive-style folder UI in
[`src/components/documents/documents-page.tsx`](../../src/components/documents/documents-page.tsx)).
The schema delta above must preserve that surface without regression. This
section was added after the initial draft once the live UI was traced
end-to-end.

### Current /docs surface

- **Route**: `/docs` → `src/app/(app)/docs/page.tsx` (Tabs hub: Documents +
  Import/Export).
- **API**: `/api/documents` (GET/POST), `/api/documents/[id]`
  (GET/PATCH/DELETE), `/api/document-folders` (CRUD, hierarchical, per-user
  sibling-unique, two-step cascade delete).
- **Upload cap**: `MAX_FILE_SIZE = 50 MB` (pre-existing); MIME allowlist of 8
  types (`pdf`, `png`, `jpeg`, `webp`, `doc`, `docx`, `txt`, `csv`).
- **Categories** (UI-side, `src/components/documents/constants.ts`):
  `offer_letter`, `cover_letter`, `certificate`, `contract`, `pay_stub`,
  `tax_form`, **`manual`** (already present), `ebook`, `learning_material`,
  `other`.
- **Polymorphism**: `entityType` + `entityId` are actively filtered (GET) and
  set by activity-log writers in `/api/applications`, `/api/benefits`,
  `/api/applications/[id]`, and others. Preserved by this ADR — treated as
  legacy, but not deprecated.
- **TanStack Query keys**: `["documents", folderKey]` and
  `["document-folders"]`. Any background pipeline that flips
  `processingStatus` must invalidate these (or push via SSE) for the UI to
  surface state transitions.

### Contracts this ADR must preserve

1. **Single-doc GET response (`/api/documents/[id]`)** — currently runs
   `Buffer.from(doc.data, "base64")` unconditionally. The schema migration in
   commit 1 of Sprint α' **must include** updating this route to read
   `filePath` first and fall back to `data`. Without that, any future
   disk-backed row silently downloads as zero bytes.
2. **List GET `select` shape (`/api/documents`)** — currently selects
   `{ id, name, fileName, fileSize, mimeType, category, entityType, entityId, folderId, notes, createdAt }`.
   New columns (`processingStatus`, `pageCount`, etc.) must be **additively**
   added to this select. They are nullable / defaulted so the payload
   extension is forward-compatible for clients that ignore unknown fields.
3. **Magic `folderId` values** — `"root"` maps to `WHERE folderId IS NULL`;
   absent means "all folders." Unchanged.
4. **Polymorphic `entityType` / `entityId`** — kept; treated as legacy for new
   work but not migrated. No consumer code is changed by this ADR.

### Orthogonal limits

The proposed **256 KB inline-vs-disk threshold** in `storage.ts` is
**independent** of the existing 50 MB upload cap. They answer different
questions:

- 256 KB → "should THIS file go in `data` or on disk?"
- 50 MB → "should we accept this upload at all?"

Raising the upload cap (e.g. to 500 MB to support full service manuals) is a
follow-up patch, not bundled into this ADR's sprint.

### Implication for ADR-0050 (reframe)

Because `category = "manual"` already exists in the My Docs UI taxonomy,
**users can upload manuals through the canonical /docs path today**. ADR-0050
is therefore reframed:

- *Original framing*: "Add manual uploads via `AssetDocument`."
- *Revised framing (post-investigation)*: "Trigger extraction pipeline on
  `Document` rows with `category = "manual"`, link processed `Document`s to
  `JobAsset`s via `AssetDocument { documentId, docType: 'manual' }`."

`AssetDocument` becomes a **link table** carrying role metadata (`docType`,
ordering, per-asset notes) rather than a parallel storage table. New manual
uploads flow through the existing /docs UI and naturally enter the new
pipeline; the asset-detail UI gains an "attach existing doc" picker plus an
upload button that ALSO writes the `AssetDocument` pivot row. ADR-0050's own
sprint plan will reflect this reframe.

### Pre-existing bug (flagged, not bundled)

`src/app/api/documents/route.ts` returns the error message `"File exceeds 10
MB limit"` while `MAX_FILE_SIZE` is `50 MB`. Pre-existing copy-paste drift.
Fix in a separate trivial PR, not in this ADR's sprint.

### Positive Consequences

- **Single pipeline for every doc-AI consumer** — extraction (ADR-0050),
  full-text search, future RAG (worklog evolution, resume parsing, cert exam
  prep) all run on `Document`. Build once, every feature benefits.
- **`/docs` becomes the canonical "your knowledge" UI** — once `AssetDocument`
  writes through `Document`, the existing Drive-style folder UI naturally
  surfaces every uploaded file (filterable by role / `entityType`). No
  separate "asset library files" UI needed long-term.
- **Strong-typed pivots preserve referential integrity** — Postgres-enforced
  FKs on `AssetDocument.assetTypeId`, `.assetId`, `.documentId`; polymorphic
  `Document.entityType / entityId` kept only for legacy back-compat.
- **Many-to-many works naturally** — the same Document can have multiple
  `AssetDocument` joins (covering multiple AssetTypes) without duplicating
  bytes. Future `contentHash` dedup further reinforces this.
- **No big-bang migration** — `data` rows keep working, `AssetDocument.filePath`
  rows keep working; new uploads use the new path, old rows backfill lazily.
- **Lays foundation for future ADRs** — `Attachment.documentId`, future
  `WorkLogDocument` pivot, future `CertificationDocument` pivot, all become
  trivial joins on the same substrate.

### Negative Consequences

- **`Document.data` becomes nullable (`String → String?`)** — TypeScript
  surface migration: all consumers reading `doc.data` must handle `null`.
  Mitigation: introduce `readDocumentBytes(doc): Promise<Buffer>` helper that
  abstracts disk vs inline; consumers should not read `data` directly going
  forward. Existing callsites identified via codegraph during implementation.
- **Two read paths during the lazy-migration window** — `AssetDocument`
  consumers must check `documentId` first, fall through to `filePath`
  otherwise. Adds a small `getAssetDocumentFile()` helper; consumers must not
  read `filePath` directly. Window closes when all rows are backfilled.
- **Photo tables stay separate** — `EquipmentPhoto`, `JobAssetPhoto`,
  `WorkLogPhoto` are intentionally **not** unified under `Document` because
  their affordances differ (cover, sort, focal point, annotations, in-place
  crop / rotate). A future ADR may revisit if a clean "photo-as-document"
  use case emerges.
- **`Document.entityType / entityId` polymorphic columns kept** — entrenches
  the weaker pattern slightly, but removing them now would break the existing
  `/docs` page filters and `learning/generate` consumer. They become legacy /
  optional; new associations must use pivot tables. Tracked for future
  deprecation.
- **Legacy `EquipmentResource` not touched by this ADR** — manuals stored on
  legacy `Equipment` rows (via `EquipmentResource.fileData Bytes?`) remain
  invisible to the new pipeline until the user migrates to `JobAsset`. This
  is intentional (per Q2 resolution: leave `Equipment` alone) but means the
  manuals KB in ADR-0050 will be JobAsset-only.

## Implementation Notes (sketch — not binding)

ADR-0051 itself is **3 commits** (Sprint α'):

1. **Schema migration + route adapter** — add the eight new fields to
   `Document`, add `documentId` FK to `AssetDocument`, add the new `@@index`
   entries. Raw SQL in the migration for the `GENERATED STORED` tsvector
   column on `markdownContent`. **Same commit** migrates
   `src/app/api/documents/[id]/route.ts` GET handler to branch on `filePath`
   vs `data` (inline implementation; the branching logic is extracted into
   the `readDocumentBytes()` helper in commit 2). Schema + route must land
   together to avoid zero-byte download regressions on any future disk-backed
   row. RED-GREEN-REFACTOR: schema-level test asserting the new columns +
   indexes exist and the FK relation resolves; route-level test asserting
   both legacy `data`-only and new `filePath`-only rows download with the
   correct bytes.
2. **Storage service** — `src/lib/documents/storage.ts` exposing
   `createDocument({ buffer, fileName, mimeType, userId, ... }): Promise<Document>`.
   Disk-vs-inline routing based on the 256 KB threshold. Sha256 content hash
   compute. `readDocumentBytes(doc): Promise<Buffer>` reads from `filePath`
   or `data` transparently. TDD: tests cover both size paths + hash
   determinism + bad-MIME rejection.
3. **AssetDocument helper + back-compat shim** —
   `src/lib/documents/asset-document.ts` exposing
   `attachDocument({ assetTypeId | assetId, document, docType, title, notes })`
   and `getAssetDocumentFile(ad): Promise<{ source: 'document' | 'legacy-filePath' | 'url', bytes?: Buffer, url?: string }>`.
   Existing `/api/asset-types/[id]/documents` and `/api/job-assets/[id]/documents`
   routes refactored to use these helpers. Tests pin all three read paths.

**Not in this ADR (deferred):**

- Extraction pipeline (markitdown / pdf-parse / mammoth) — that lives in ADR-0050.
- Background processing worker / job queue — also ADR-0050.
- Chunking + RAG endpoints + strict-citation contract — also ADR-0050.
- `Attachment.documentId` FK migration — own follow-up patch (cheap; can be
  an ADR-0051 amendment or a tiny follow-up ADR once a consumer demands it).
- Equipment → JobAsset migration — out of scope (own future ADR if pursued;
  currently legacy `Equipment` is soft-deprecated but stable).
- Photo-table unification — out of scope (different affordances).
- `Document.data` removal / forced backfill — out of scope (revisit when
  `contentHash` dedup work begins; the legacy column carries no operational
  cost while it's kept).

## References

- ADR-0012 — Asset Library Knowledge Backbone (introduced `AssetType` +
  `JobAsset` + `AssetDocument`; this ADR extends the pattern by adding the
  substrate that `AssetDocument` will join against).
- ADR-0017 — Worklog versions + tsvector pattern (this ADR extends the same
  `Unsupported("tsvector")` + GENERATED STORED column pattern to `Document`).
- ADR-0044 — AI provider router (downstream dependency for ADR-0050's
  extraction pipeline, not for this ADR directly).
- ADR-0050 (forthcoming) — Equipment Manuals Knowledge Base, the immediate
  consumer this foundation unlocks.
- Parked-ideas entries updated this session: "markitdown" (server-side path
  unblocked by ADR-0044), "pgvector RAG over `WorkLogVersion`" (downgraded
  in favour of tsvector + structural scoping; pgvector deferred until a real
  semantic-only query pattern surfaces).
