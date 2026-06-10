# Workflow: Document Round-Trip Feature (Markdown Export + Re-Import)

A document round-trip lets users take in-app content out as a portable file, edit it externally (e.g. with an AI assistant), and pull the edited version back into the same row without losing identity. This recipe captures what worked when adding the "Grill Me" markdown round-trip in 2026-06.

**Last Updated:** 2026-06-09

## Stack Context

- Next.js 16.1.6 + Turbopack, React 19
- Prisma 6.19.2 — `WorkLog` has NO integer `version` column; versions are append-only `WorkLogVersion` rows. Version count is a `prisma.workLogVersion.count(...)` or `groupBy({by:["workLogId"], _count:{_all:true}})` query.
- ProseMirror / Tiptap 3 with custom inline atoms (mention, tag, shiftBlock, moodBlock) and custom blocks (canvasBlock, photo).
- `gray-matter@4.0.3` for YAML frontmatter parse + serialize. Permissive — leaves `\n` prefix on `content` after fence; strip one leading `\n`.
- `prosemirror-markdown@1.13.4` (NOT used in this sprint; we wrote a direct JSON walker instead because the default serializer doesn't know our custom nodes).
- `jszip@3.10.1` for bulk export. `JSZip.generateAsync({type: "uint8array"})` returns a `Uint8Array` ready for the response body.
- Vitest 4 — strict TDD (RED → GREEN → REFACTOR) on every backend phase; UI parked from TDD scope per ADR-0018.
- `base-ui` (NOT Radix) for shadcn/ui components — `DropdownMenuItem` uses `onClick` not `onSelect`.

## Successful Sequence

1. **Architectural Reviewer pass first.** Three competing-constraint questions surfaced before any code:
   - "Bulk action vs per-row vs both?" — answered: bulk action (export) + per-file detection (re-import).
   - "Per-worklog endpoint vs global router?" — answered: per-worklog v1, with the route shape leaving room for a global router later.
   - "What does re-import strip?" — answered: canvas blocks dropped + mentions re-resolved.
2. **Phase 1 — pure helpers, RED-GREEN-REFACTOR each.** Three sub-phases, each its own commit:
   - **1.1 Frontmatter** (`src/lib/worklog/export/frontmatter.ts`) — `serializeFrontmatter()` + `parseFrontmatter()`. Strict parser rejects missing `id` / non-numeric `version` / malformed YAML. Quote scalars containing `:` with single quotes (escape `'` by doubling). 16 tests.
   - **1.2 PM-to-Markdown serializer** (`src/lib/worklog/export/pm-to-markdown.ts`) — `serializeToMarkdown(doc)` returning `{markdown, droppedBlocks}`. Direct JSON walker (no PM Node rehydration) so it's server-safe. Custom nodes handled by name. 27 tests.
   - **1.3 Composer** (`src/lib/worklog/export/worklog-to-markdown.ts`) — `worklogToMarkdown(input)` returning `{markdown, filename, droppedBlocks}`. `slugifyTitle()` does NFKD normalize, strip combining marks, lowercase, ASCII-only, 80-char cap, "untitled" fallback. 11 tests.
3. **Phase 2 — single export route** (`src/app/api/work-logs/[id]/export/route.ts`). GET, owner-scoped, `Content-Disposition: attachment; filename="<slug>.md"`. 11 tests.
4. **Phase 3 — bulk export route** (`src/app/api/work-logs/export-bulk/route.ts`). POST `{ids}`, hard cap at 100, N=1 returns `text/markdown`, N>1 returns `application/zip`. `uniquify()` collision-suffix uses first 6 alphanumeric chars of the worklog id. 13 tests.
5. **Phase 4a — pure import-decision function** (`src/lib/worklog/import/grill-frontmatter.ts`). `decideImport({parsedFrontmatter, workLogExists, currentVersionCount})` returns a 4-case union: `match` / `conflict` / `needs-picker` / `not-found`. **Pure** — no I/O. 6 tests.
6. **Phase 4b — re-import route** (`src/app/api/work-logs/import-md/route.ts`). POST `{source}`, mirrors the existing import route's auth + size validation. Calls `parseFrontmatter` → owner-scoped lookup → `prisma.workLogVersion.count()` → `decideImport()` → branch on the result. The match path mirrors the editor's PUT route invariants exactly: `validateContentJson`, additive `assetIds` merge, replace-with-self-loop-guard `linkedNoteIds`, ADR-0017 auto-snapshot writer with `label: "Re-imported via Grill Me"`. 13 tests.
7. **Phase 5a — Export bulk-bar button.** Added a prop `onExport` to `WorklogNotesBulkBar`, wired in `worklog-notes-view.tsx` to call `exportBulkWorklogs(selectedIdList)`. Client helper in `src/lib/worklog/export/client.ts` extracts the filename from `Content-Disposition` and triggers a download via a synthetic `<a>` click.
8. **Phase 5b — Re-import via the existing import dialog.** Discriminator `hasGrillFrontmatter(source)` is a regex check (`---` fence + `id:` + `version:` keys). When it matches, the dialog routes to `/api/work-logs/import-md` directly (no React Query hook — minimal logic). Four new row statuses: `reimported` / `conflict` / `needs-picker` / `not-found` with appropriate icons + amber/emerald color. On `reimported`, invalidate `["work-logs"]` and `["worklog-versions", workLogId]`.
9. **Phase 6 — Persistence.** ADR, Manual entry, this workflow recipe, memory keeper update, handoff.
10. **Local commits per phase.** Push to main only after all phases land and the user confirms wrap-up.

## First-Attempt Failures (gotchas worth recording)

- **Frontmatter body had a leading `\n`.** `gray-matter` retains the blank-line separator after the closing fence in `parsed.content`. The serializer-side fix is to strip exactly one leading `\n` from the parsed `body` so the round-trip is verbatim. Caught in the Phase 1.1 RED-GREEN cycle when the round-trip test failed by exactly one character.
- **Tried `defaultMarkdownSerializer` from `prosemirror-markdown` first.** It doesn't know our custom Tiptap nodes (`mention`, `tag`, `shiftBlock`, `moodBlock`, `photo`, `canvasBlock`). Switched to a direct JSON walker that handles every custom node by name. Cleaner, ~250 lines, server-safe.
- **`DroppedBlock` shape mismatch.** First draft of `pm-to-markdown` tests used `{type, reason}`, but the import side already uses `{type: string, count: number}`. Updated the test scaffold before implementing — kept the convention consistent across import/export.
- **`WorkLog` has NO integer `version` field.** Discovered by reading `prisma/schema.prisma`. The exporter populates the frontmatter `version` from `prisma.workLogVersion.count(...)` or a `groupBy` aggregate. The re-import route compares incoming `frontmatter.version` to the same count.
- **Phase 4b mocked too few Prisma calls at first.** The auto-snapshot block also calls `findFirst({orderBy:{createdAt:"desc"}})`, `findMany({select:{id, createdAt, isManual}})`, and `deleteMany({where:{id:{in:[...]}}})`. Add all five mocks (`count`, `findFirst`, `create`, `findMany`, `deleteMany`) to the test file or those branches throw at runtime.
- **base-ui `DropdownMenuItem` uses `onClick`, not `onSelect`.** Phase 5b doesn't have a dropdown but if you reach for one, remember Radix's `onSelect` API is silently dropped in base-ui.

## Decision Hooks (when to deviate)

- **Skip Phase 4a's pure decision function** if you only have two outcomes (match vs not-match). With four+ branches it pays for itself fast — the route handler stays a thin orchestrator.
- **Use `defaultMarkdownSerializer`** if your editor schema is vanilla Tiptap StarterKit. Custom inline atoms or block nodes make the JSON walker the better choice.
- **Skip the discriminator** and POST every file to a single endpoint that figures out the intent on the server, IF the cost of wrong-routing is low. With re-import, wrong-routing means an accidental cross-write to a different note — the discriminator is mandatory.

## Pattern: 4-Case ImportDecision Union

```ts
export type ImportDecision =
  | { kind: "match";        workLogId: string }
  | { kind: "conflict";     workLogId: string; fileVersion: number; currentVersion: number }
  | { kind: "needs-picker"; reason: "no-frontmatter" }
  | { kind: "not-found";    attemptedId: string };

export function decideImport(input: {
  parsedFrontmatter: GrillFrontmatter | null;
  workLogExists: boolean;
  currentVersionCount: number;
}): ImportDecision {
  if (!input.parsedFrontmatter) {
    return { kind: "needs-picker", reason: "no-frontmatter" };
  }
  if (!input.workLogExists) {
    return { kind: "not-found", attemptedId: input.parsedFrontmatter.id };
  }
  const fileVersion = input.parsedFrontmatter.version;
  if (fileVersion >= input.currentVersionCount) {
    return { kind: "match", workLogId: input.parsedFrontmatter.id };
  }
  return {
    kind: "conflict",
    workLogId: input.parsedFrontmatter.id,
    fileVersion,
    currentVersion: input.currentVersionCount,
  };
}
```

The `match` branch covers both `version ===` and `version >`. "File ahead of server" can happen when a snapshot was deleted by retention thinning between export and re-import — auto-snapshotting on every match makes this safe. Pure function = 6 cheap tests cover every branch.

## Pattern: Bulk Endpoint Format Toggle

```ts
const BULK_MAX = 100;

export async function POST(request: Request) {
  // ... auth, body validation, prisma findMany scoped to userId ...
  if (logs.length === 1) {
    const md = worklogToMarkdown({...}).markdown;
    return new Response(md, {
      headers: {
        "Content-Type": "text/markdown; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  }
  const zip = new JSZip();
  for (const log of logs) {
    const result = worklogToMarkdown({...});
    zip.file(uniquify(result.filename, takenNames), result.markdown);
  }
  const buf = await zip.generateAsync({ type: "uint8array" });
  return new Response(buf, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="worklogs-${YMD}.zip"`,
    },
  });
}
```

Uniquify pattern keeps filenames stable when titles collide:

```ts
function uniquify(filename: string, taken: Set<string>, id: string): string {
  if (!taken.has(filename)) { taken.add(filename); return filename; }
  const stem = filename.replace(/\.md$/, "");
  const suffix = id.replace(/[^a-z0-9]/gi, "").slice(0, 6);
  let candidate = `${stem}-${suffix}.md`;
  let n = 1;
  while (taken.has(candidate)) {
    candidate = `${stem}-${suffix}-${n}.md`;
    n += 1;
  }
  taken.add(candidate);
  return candidate;
}
```

## Anti-Patterns to Avoid

- **Don't dedupe re-imports by content fingerprint.** Re-imports BY DEFINITION have a different body than what's on the server. Fingerprint dedupe will silently merge them or treat the rewrite as "already imported."
- **Don't auto-write on conflict.** The user lost work the moment they exported. Surface the conflict, let them decide. ADR-0017's auto-snapshot makes overwrites recoverable, but a quiet overwrite confuses the user about which version they're looking at.
- **Don't trust frontmatter without owner-scoping.** Frontmatter is editable by anyone. EVERY lookup must `where: { id, userId }` so a tampered `id` field can never cross user boundaries.
- **Don't put the export endpoint behind a `POST /search`-style filter.** Use REST: `GET /api/work-logs/{id}/export` for single, `POST /api/work-logs/export-bulk` with `{ids}` for bulk.
- **Don't skip the regex discriminator on the client.** Routing every dropped `.md` to the re-import endpoint blocks first-time imports of pre-existing markdown files (no frontmatter). The discriminator is what keeps the two pipelines separate.
