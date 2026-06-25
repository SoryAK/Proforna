# ADR-0050: Equipment Manuals Knowledge Base

## Status

Proposed

## Date

2026-06-25

## Context

ADR-0051 (Accepted) shipped Sprint α': the canonical `Document` substrate
plus `createDocument` / `readDocumentBytes` / `attachDocument` helpers, and
reframed manual uploads to flow through the `/docs` canonical upload path.
What ADR-0051 deliberately deferred lives here:

> Not in this ADR (deferred):
>
> - Extraction pipeline (markitdown / pdf-parse / mammoth) — that lives in ADR-0050.
> - Background processing worker / job queue — also ADR-0050.
> - Chunking + RAG endpoints + strict-citation contract — also ADR-0050.

The user need (long-standing, captured in `parked-ideas.md`): a service-manual
PDF (often 50–500 MB, often scanned, often safety-critical) should be
queryable from the asset library. Killer query: *"what's the torque spec for
the front bearing on the 2019 model?"* against a markdown projection beats
scrolling 300 pages of PDF. The same pipeline is the foundation for every
future document-AI consumer (resume parsing, research-tab ingestion, future
WorkLog evolution context).

ADR-0044 (Accepted) shipped the AI provider router with `gemini-fast`,
`gemini-pro`, and `ollama` tiers. ADR-0050 extends the router with the two
new task classes this feature needs (`ocr-page` and `embed`) rather than
introducing a parallel AI surface.

### What's locked (do not re-litigate)

- **Manuals flow through `/docs`** — uploaded as `Document` rows with
  `category = "manual"`, linked to assets via `AssetDocument { documentId,
  docType: "manual" }`. Set by ADR-0051's reframe.
- **JobAsset-only** — legacy `Equipment` table is not migrated; manuals KB
  applies to the modern `JobAsset` line. Per ADR-0051 Q2 resolution.
- **Provider routing** — every LLM / embedding call goes through
  `src/lib/ai/router.ts`; ADR-0050 must not bake in a specific model name.
- **Storage substrate** — `Document.markdownContent` is the destination for
  extracted text; `Document.processingStatus` is the FSM column. Both fields
  already exist on disk (ADR-0051 migration).

### Open forks resolved this session (the Griller pass)

Three architectural forks were Grilled and locked:

1. **Q1 — Worker boundary (path C).** Hybrid extraction: pure-Node
   (`pdf-parse` + `mammoth`) for text-bearing files; ADR-0044 vision-tier
   OCR fallback (page-by-page through `gemini-fast`) for scanned PDFs and
   image-only inputs. Rejected: Path A (Python sidecar — heavy deploy
   surface, marginal benefit over the routed vision-tier path) and Path B
   (pure-Node-only — most equipment manuals are scanned, so a Node-only
   MVP visibly fails the canonical use case at ship time).
2. **Q2 — Processing pipeline (path β).** New `DocumentProcessingJob`
   Prisma model + an in-process poller. Persisted retry, observable via
   Prisma Studio, no new runtime dependency (no Redis, no pg-boss).
   Rejected: α (fire-and-forget Promise — loses in-flight jobs on HMR
   restart; no retry) and γ (external queue — premature for solo-dev
   workload).
3. **Q3 — Citation contract (i + ii + opt-iii).** Hard-refuse on zero
   retrieval (i); best-effort answer with explicit `confidence` field +
   citations array when chunks exist (ii); opt-in two-pass LLM-judged
   citation gate (iii) for safety-critical queries — triggered either by
   user toggle ("verify before answering") OR by automatic regex match on
   the prompt against a safety-critical phrase list (torque / amperage /
   voltage / weight limit / pressure / temperature / clearance). Rejected
   the original pure-i+iii recommendation: refusing borderline retrievals
   feels broken when chunking-boundary or synonym misses cause the gap.

## Decision

Build the Equipment Manuals Knowledge Base as a **four-sprint feature
arc** on top of ADR-0051's substrate, using ADR-0044's provider router
for every LLM/embedding/vision call. The arc ships incrementally so each
sprint is independently shippable and reverts cleanly.

### Locked architectural choices

1. **Extraction = Path C (hybrid Node + cloud-vision OCR).**
   `src/lib/documents/extraction/` exposes `extractDocument(doc):
   Promise<{ markdown, droppedBlocks, extractor: "pdf-parse" | "mammoth"
   | "vision-ocr" }>`. Branching by MIME + extracted-text-density
   heuristic. Vision OCR routes through ADR-0044's new `ocr-page` task
   class; page-by-page invocation; markdown concatenated in page order.
2. **Processing pipeline = Path β (`DocumentProcessingJob` + in-process
   poller).** New table:

   ```prisma
   model DocumentProcessingJob {
     id              String   @id @default(cuid())
     documentId      String
     document        Document @relation(fields: [documentId], references: [id], onDelete: Cascade)
     kind            String   // "extract" | "chunk-embed" — kept as string for forward-compat
     status          String   // "pending" | "running" | "succeeded" | "failed" | "cancelled"
     attempts        Int      @default(0)
     maxAttempts     Int      @default(3)
     lastError       String?
     lastErrorAt     DateTime?
     scheduledFor    DateTime @default(now())
     startedAt       DateTime?
     completedAt     DateTime?
     createdAt       DateTime @default(now())

     @@index([status, scheduledFor])
     @@index([documentId, kind])
   }
   ```

   `scripts/document-processor.mjs` is the standalone poller (long-poll
   loop, `SELECT ... FOR UPDATE SKIP LOCKED` semantics via Prisma raw,
   exponential backoff on retry). Dev mode: optionally auto-spawned via
   `npm run dev:full`; not coupled to the Next.js process. Production:
   runs as a separate process. Status transitions on `Document.processingStatus`
   are written by the poller, not by route handlers.
3. **Chunking = fixed-token windows with overlap.** ~512-token windows,
   ~64-token overlap, on the **markdown** output (not the raw extracted
   stream — markdown preserves heading hierarchy and table boundaries
   that aid retrieval). Page numbers preserved as chunk metadata so
   citations can deep-link to the source PDF page.
4. **Embeddings = 768-dimensional, ADR-0044 routed.** New `task: "embed"`
   in the router. Default tier = `gemini-fast` (`text-embedding-004`,
   768d) with `ollama` (`nomic-embed-text`, 768d) as offline fallback.
   pgvector extension installed; `DocumentChunk` model:

   ```prisma
   model DocumentChunk {
     id            String   @id @default(cuid())
     documentId    String
     document      Document @relation(fields: [documentId], references: [id], onDelete: Cascade)
     chunkIndex    Int
     chunkText     String
     pageNumber    Int?
     tokenCount    Int
     embedding     Unsupported("vector(768)")
     createdAt     DateTime @default(now())

     @@unique([documentId, chunkIndex])
     @@index([documentId])
   }
   ```

   The ivfflat index on `embedding` is created in raw SQL inside the
   migration (Prisma's schema language doesn't model pgvector indexes).
5. **RAG endpoint = `POST /api/asset-types/[id]/manuals/ask` with
   citation contract i + ii + opt-iii.** Request body:
   `{ query: string, verify?: boolean }`. Response envelope:

   ```ts
   type ManualAskResponse =
     | { refused: true; reason: "no_relevant_chunks" | "below_confidence_floor" }
     | {
         refused: false;
         answer: string;
         confidence: "high" | "medium" | "low";
         citations: Array<{ documentId: string; chunkIndex: number; pageNumber: number | null; excerpt: string }>;
         verified: boolean; // true iff the iii second-pass gate ran and passed
       };
   ```

   Server-side: ANN search → top-k (k=8) → if zero chunks above similarity
   threshold (cosine ≥ 0.65), refuse via case i. Else build prompt with
   chunk excerpts + force citation array via JSON-mode response. If
   `verify === true` OR query matches the safety-critical regex set,
   run pass-2 LLM-judge ("Would a domain expert sign off on this answer
   given these citations? Reply JSON `{ ok: boolean, reason: string }`")
   via `gemini-fast`; if `ok === false`, return case i variant with
   `reason: "below_confidence_floor"`. Both passes go through
   ADR-0044's router.
6. **AssetType detail page UI** surfaces (a) attached manuals (filterable
   by `docType: "manual"` from existing `AssetDocument` query), (b) a
   per-AssetType "Ask the manual" affordance with the verify-toggle, (c)
   citation chips that deep-link to the source PDF page when clicked.

### Locked secondary decisions

- **Safety-critical regex set** lives in `src/lib/manuals/safety-critical-patterns.ts`
  as a single exported array. Single source of truth so the list is
  inspectable, testable, and editable by future ADRs without touching
  route logic. Initial seed: `/\b(torque|amperage|voltage|psi|pressure|temperature|clearance|weight\s*limit|load\s*rating|tolerance)\b/i`.
- **Confidence-flag derivation** is a deterministic function of the top
  retrieved chunk's cosine similarity (`high ≥ 0.80`, `medium ≥ 0.70`,
  `low ≥ 0.65`). LLM does NOT decide its own confidence in case ii — the
  retrieval metric does. The LLM's job in case ii is purely text
  generation + citation array. iii's job is the actual quality gate.
- **Chunk retention** mirrors `Document.data` retention: kept indefinitely
  for now. Revisit when contentHash dedup work begins (same trigger as
  ADR-0051 §"Implementation Notes").
- **Upload size for manuals** — stays under the current 50 MB cap for
  Sprint β1–β2. Raising the cap to support full service manuals (often
  200–500 MB) is a separate follow-up patch, not bundled into this ADR's
  sprints. Out-of-scope marker explicit so the gate doesn't drift.
- **Copyright posture** — user-uploaded manuals for personal use are
  in-scope; redistribution is not. No public-share affordance for
  `category: "manual"` documents. Will need a one-line policy note in
  the upload UI when β4 ships.

## Detail

### Extraction pipeline (Path C internals)

`extractDocument(doc)` decision tree:

1. If MIME is plain text / markdown / HTML → pass through (markitdown's
   plain-text path; we don't need a binary parser).
2. If MIME is DOCX (`application/vnd.openxmlformats-officedocument.wordprocessingml.document`)
   → `mammoth` → markdown.
3. If MIME is XLSX / PPTX → out of scope for β1; queue with `kind:
   "extract"` `status: "failed"` `lastError: "unsupported_format"` for
   visibility. Revisit when first user hits one.
4. If MIME is PDF:
   - Try `pdf-parse` → if extracted text density >150 chars/page average,
     accept as text PDF, return markdown.
   - Otherwise treat as scanned → rasterize each page (via `pdfjs-dist`,
     already in deps for `import` paths) → for each page, route a
     `task: "ocr-page"` call through ADR-0044 with the page image → LLM
     returns markdown for the page → concatenate.
5. If MIME is image (`image/png`, `image/jpeg`) → single-page OCR via
   the same `ocr-page` task.
6. Anything else → fail loud with `unsupported_format` (visible in the
   processing-job row, surfaced in `/docs` UI as a per-document error
   chip in β4).

Extracted markdown is written to `Document.markdownContent` by the
poller. The substrate's GENERATED STORED tsvector index on
`markdownContent` (ADR-0051) means full-text search lights up for free
the moment β1 ships, before any embedding work.

### Processing pipeline (Path β internals)

State machine on `Document.processingStatus`:

```text
none → pending → running → succeeded (markdownContent populated)
                       ↘ failed (lastError populated, retryable up to maxAttempts)
```

Two job kinds:

- `kind: "extract"` — runs `extractDocument`, writes
  `Document.markdownContent`, enqueues a follow-up `kind: "chunk-embed"`
  job on success.
- `kind: "chunk-embed"` — reads `markdownContent`, chunks, embeds via
  router's `embed` task, bulk-inserts `DocumentChunk` rows.

The poller (`scripts/document-processor.mjs`):

- Long-poll loop on `DocumentProcessingJob.status = "pending" AND
  scheduledFor ≤ now()`.
- Claims a job with `UPDATE ... SET status = "running" WHERE id = ?
  AND status = "pending" RETURNING *` (Postgres atomic claim — no
  separate locks needed at the single-poller-instance level we're
  targeting).
- Exponential backoff on failure: `nextAttemptAt = now() + min(60s *
  2^attempts, 1h)`.
- After `maxAttempts`, transitions to `status: "failed"` permanently;
  surfacing in β4 UI.

### Chunking + embedding

`src/lib/documents/chunking/` exposes:

- `chunkMarkdown(markdown, opts): Chunk[]` — fixed-token windows on the
  markdown stream, preserving page-number annotations (the extractor
  emits an HTML comment `<!-- page: N -->` between pages; the chunker
  reads + propagates these).
- `embedChunks(chunks): Promise<EmbeddedChunk[]>` — batched call through
  router's `embed` task. Batch size = 32 (Gemini's
  `text-embedding-004` accepts batches; Ollama's `nomic-embed-text`
  serializes internally — same caller code).

ADR-0044 router extensions:

```ts
// New task classes on the router
type AiTask =
  | /* existing */
  | "ocr-page"        // input: { imageBuffer; mimeType; hintLanguage? }, output: { markdown }
  | "embed";          // input: { texts: string[] }, output: { vectors: number[][] }
```

Both new tasks are pure additions to the registry — no signature change
on existing tasks.

### RAG endpoint contract details

The opt-in iii gate doubles per-query cost when triggered. Cost envelope
for the safety-critical case at personal usage volume (~20 manual
queries/mo with verify-on): negligible (< $0.05/mo). The latency cost
is ~1.5x — acceptable since the user explicitly opted in (or the prompt
matched a safety pattern, in which case the extra wait is the right
trade).

Retrieval uses pgvector's `<=>` cosine-distance operator with the
ivfflat index. `k=8` is the default top-k; tuneable as
`MANUALS_RAG_K` env var. Re-ranking is deferred (BM25 + cosine hybrid,
or cross-encoder reranker) — a Phase 2 polish if recall@8 proves
insufficient.

### UI (β4)

AssetType detail page gains a "Manuals" section:

- List of attached manuals (per `AssetDocument` where `docType =
  "manual"`).
- Per-row status chip from `Document.processingStatus` —
  *Processing* / *Ready* / *Failed (retry)*.
- "Ask the manual" affordance: textarea + Send + "Verify answer (slower)"
  toggle. Submits to `POST /api/asset-types/[id]/manuals/ask`.
- Response renders: answer body, confidence chip (high/medium/low),
  citations as clickable chips deep-linking to the source PDF page
  (uses the existing `/api/documents/[id]/route.ts` GET handler with a
  fragment param `#page=N` per the substrate's `filePath` story).
- Refuse cases render a clear "I couldn't find this in the manual"
  message with a hint to rephrase + a fallback "Open manual" link.

## Implementation Notes (sketch — not binding)

ADR-0050 is **four sprints**, each independently shippable:

### Sprint β1 — Extract on text PDFs + DOCX (no OCR yet)

1. `prisma/migrations/<ts>_add_document_processing_job` — adds the
   `DocumentProcessingJob` table + indexes. No raw SQL needed for this
   table.
2. `src/lib/documents/extraction/` — `extractDocument()` with the Node
   branches only (`pdf-parse`, `mammoth`, plain-text passthrough).
   Vision branch returns `unsupported_format` for now (β2 wires it).
3. `scripts/document-processor.mjs` — minimal poller, handles
   `kind: "extract"` only, writes back to `Document.markdownContent`.
4. Wire `POST /api/documents` to enqueue a `kind: "extract"` job on
   successful upload when `category = "manual"`. Other categories stay
   unprocessed for now (out-of-scope for β1).
5. TDD: extraction tests (pdf-parse + mammoth fixtures), poller tests
   (job claim, retry-on-throw, max-attempts), integration test
   uploading a fixture PDF and asserting `markdownContent` populated.

**Ship signal**: a text PDF dropped into `/docs` with `category =
"manual"` ends up with `markdownContent` populated, full-text search
(ADR-0051 tsvector index) finds keywords inside the manual. No UI
changes required for β1.

### Sprint β2 — OCR fallback via ADR-0044 vision tier

1. Extend `src/lib/ai/router.ts` with `task: "ocr-page"`; add provider
   methods on `gemini-fast` (`gemini-2.5-flash` with image input). No
   `ollama` implementation in β2 (local vision is out-of-scope).
2. Wire the vision branch in `extractDocument()` — `pdfjs-dist`
   rasterization → per-page `ocr-page` invocation → markdown
   concatenation with `<!-- page: N -->` separators.
3. Update poller: same `kind: "extract"` handler now routes through the
   vision branch when the text-density heuristic trips.
4. TDD: router-extension tests (envelope shape, fallback to refused on
   provider error), extractor tests with a known-scanned-PDF fixture.

**Ship signal**: a scanned-PDF service manual lands with usable
`markdownContent`; tsvector search hits text that was image-only on
the page.

### Sprint β3 — Chunking + embeddings + pgvector

1. `prisma/migrations/<ts>_add_pgvector_and_document_chunk` — installs
   pgvector extension via raw SQL (`CREATE EXTENSION IF NOT EXISTS
   vector`), creates `DocumentChunk` table, creates ivfflat index in
   raw SQL.
2. Extend router with `task: "embed"` (gemini-fast +
   `text-embedding-004`; ollama + `nomic-embed-text` fallback).
3. `src/lib/documents/chunking/` — `chunkMarkdown` + `embedChunks`.
4. Poller gains `kind: "chunk-embed"` handler; `extract` handler
   enqueues a `chunk-embed` follow-up on success.
5. TDD: chunker tests (page-marker propagation, window/overlap math,
   token-count accounting via a deterministic tokenizer mock), embed
   tests (router routing, batch handling), poller tests for the
   two-stage transition.

**Ship signal**: every `category: "manual"` document has populated
`DocumentChunk` rows after upload. ANN search via raw SQL returns
relevant chunks.

### Sprint β4 — RAG endpoint + AssetType detail UI

1. `src/lib/manuals/safety-critical-patterns.ts` — single-source regex
   array.
2. `POST /api/asset-types/[id]/manuals/ask` route — implements the
   citation contract (i + ii + opt-iii).
3. `src/lib/manuals/rag.ts` — pure helpers (`retrieveTopK`,
   `composePrompt`, `parseCitations`, `judgeAnswer`) so the route is
   thin and the heavy logic is unit-testable.
4. AssetType detail page — Manuals section + "Ask the manual" UI.
5. Citation deep-link wires through existing `/api/documents/[id]`
   GET with `#page=N` fragment.
6. TDD: helper-layer tests (deterministic with mocked router), route
   tests for all three citation-contract cases (refuse / answer /
   verified-refuse), Playwright smoke for the UI happy path.

**Ship signal**: user uploads a manual, asks a question, gets a
cited answer with the right confidence flag; toggling verify on a
safety-critical query produces a verified or refused response.

### Not in this ADR (deferred)

- Re-ranking (BM25 + cosine hybrid, cross-encoder) — Phase 2 polish.
- Local-tier vision OCR (`ollama` `llava` / equivalent) — wait for
  hardware-side validation; β2's `gemini-fast` path is sufficient.
- Re-indexing / re-embedding on chunker-strategy changes — manual
  Prisma Studio nuke + re-enqueue for now; automate when the second
  strategy change happens.
- XLSX / PPTX extraction — out-of-scope until a user uploads one.
- Upload-cap increase beyond 50 MB — separate trivial patch.
- Public-share / link-out affordance for manuals — copyright posture
  forbids; revisit if the affordance ever becomes user-facing.
- Resume-PDF / research-tab consumers — same `extractDocument`
  helper will serve them, but the wiring is per-feature scope.

## Positive Consequences

- **Substrate dividend** — every byte ADR-0051 added pays off here. No
  parallel storage, no duplicate upload routes, no schema branching.
  `category = "manual"` is the only fork at the upload layer.
- **Tsvector free win** — the moment β1 lands, the existing GENERATED
  STORED tsvector index on `markdownContent` makes manuals
  full-text-searchable across `/docs`. Users get value before any RAG
  endpoint is online.
- **Router-mediated everything** — adding `ocr-page` + `embed` task
  classes through ADR-0044's existing facade means swap costs are
  trivial (Gemini → local vision when hardware is ready; embed model
  swap requires a re-chunk-embed sweep but the call site changes one
  task type). No provider-specific code in the manuals pipeline.
- **Persisted retry from day one** — `DocumentProcessingJob` makes
  failure visible (Prisma Studio, β4 status chips) and recoverable
  (poller drains retries). No silent loss of work on HMR/restart.
- **Safety contract is principled, not ad-hoc** — the regex set +
  opt-in iii gate is inspectable, testable, and modifiable without
  touching route logic. The next ADR can tune the regex list or
  promote iii to always-on without architectural change.

## Negative Consequences

- **pgvector adds a Postgres extension dependency** — `CREATE
  EXTENSION` requires DB-superuser access at install time. Local dev
  is fine (the user is superuser); a future managed-Postgres
  production migration will need the extension pre-enabled by the
  provider. Tracked as a deploy-time prereq.
- **A new long-running process** — the standalone poller adds an
  operational surface. Dev-mode: minor (auto-spawn via `npm run
  dev:full` or manual `node scripts/document-processor.mjs`).
  Production: needs a process supervisor (systemd / PM2 / similar)
  when deploy happens. ADR explicitly does NOT pick the production
  supervisor — that's a future deploy-ADR decision.
- **Per-page OCR cost on scanned manuals** — a 300-page scanned
  service manual = 300 `ocr-page` calls. At Gemini Flash 2.5 prices
  (~$0.0001/image), that's ~$0.03 per manual. Not a real concern at
  personal-use volume; flagged for visibility.
- **Embedding model lock-in by data shape** — once chunks are
  embedded at 768d with model X, switching to a 1536d model OR a
  semantically incompatible 768d model requires a full re-embed
  sweep. Choosing `text-embedding-004` is defensible (Gemini's
  current default, free tier on ADR-0044) but a future swap is not
  free.
- **iii gate failure mode** — the LLM judge sometimes flags
  legitimate answers as below-confidence (it's the same model that
  generated the answer; conservative bias compounds). Mitigation:
  the gate is opt-in, so users who care about the no-false-positive
  property get it; default-off users get faster answers. Phase 2
  could add metrics: how often does the gate refuse a query that
  the user manually re-runs with verify-off?

## Open Questions

These are non-blocking and resolved during implementation:

1. **Chunk size + overlap.** 512/64 is a starting heuristic. Adjust
   per real-corpus recall@8 measurements once β3 has ≥3 real manuals
   ingested. Note: changing this requires re-chunk-embed of existing
   manuals.
2. **Embedding model dimension.** 768d is locked for forward
   compatibility with both `text-embedding-004` and
   `nomic-embed-text`. If we ever move to a higher-dim model
   (1536d / 3072d), the `Unsupported("vector(768)")` column type
   needs a destructive ALTER + full re-embed. Same gotcha as #1.
3. **Citation page-deep-link fidelity.** The `#page=N` fragment works
   in browser PDF viewers but not all PDF viewers honor it on direct
   file links. If the PDF.js inline viewer in `/docs` doesn't, a
   fallback "scroll to page" affordance in the viewer is the fix.
4. **OCR retention vs re-OCR on demand.** Today: extracted markdown
   is persisted in `Document.markdownContent` indefinitely. A future
   audit might force re-OCR on model-version bump (per-page metadata
   to track which model OCR'd which page). Out of scope for v1.

## References

- [ADR-0012](0012-asset-library-knowledge-backbone.md) — introduced
  `AssetType` + `JobAsset` + `AssetDocument`; this ADR's UI surfaces
  the manuals tab on the asset detail page introduced there.
- [ADR-0017](0017-worklog-version-history-and-visual-diff.md) —
  precedent for the GENERATED STORED tsvector + `Unsupported(...)`
  pattern; `DocumentChunk.embedding` uses the analogous escape hatch
  for pgvector.
- [ADR-0044](0044-ai-provider-router.md) — provider router; this
  ADR extends it with two new task classes (`ocr-page`, `embed`)
  rather than introducing a parallel AI surface.
- [ADR-0045](0045-ai-provenance-and-mode-picker-ui.md) — provenance +
  mode picker; the manuals-ask UI will inherit the mode-picker
  affordance for the verify toggle's visual treatment.
- [ADR-0051](0051-document-substrate-foundation.md) — the document
  substrate this ADR consumes. `createDocument`, `attachDocument`,
  `readDocumentBytes`, `Document.markdownContent`, the tsvector
  index, and `AssetDocument.documentId` all come from there.
- Parked-ideas entries closed by this ADR landing:
  - `markitdown — Microsoft file-to-markdown converter` (promotion
    trigger met: "Equipment manuals knowledge base sprint scoped").
  - `pgvector RAG over WorkLogVersion for AI evolution context`
    (partially — pgvector is now installed; the WorkLog evolution
    use case becomes a follow-up that reuses the same `embed` task
    class and `DocumentChunk` pattern).
