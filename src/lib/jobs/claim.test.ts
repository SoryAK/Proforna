import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    $queryRaw: vi.fn(),
  },
}));

import { prisma } from "@/lib/prisma";
import { claimNextJob, type ClaimedJob } from "./claim";

const mockQueryRaw = vi.mocked(prisma.$queryRaw) as unknown as ReturnType<
  typeof vi.fn
>;

function fakeRow(overrides: Partial<ClaimedJob> = {}): ClaimedJob {
  return {
    id: "job-1",
    documentId: "doc-1",
    kind: "extract",
    status: "running",
    attempts: 1,
    maxAttempts: 5,
    scheduledFor: new Date("2026-06-25T12:00:00Z"),
    claimedAt: new Date("2026-06-25T12:00:00Z"),
    completedAt: null,
    lastError: null,
    createdAt: new Date("2026-06-25T11:00:00Z"),
    updatedAt: new Date("2026-06-25T12:00:00Z"),
    ...overrides,
  };
}

describe("claimNextJob", () => {
  beforeEach(() => {
    mockQueryRaw.mockReset();
  });

  it("returns the claimed row when one is available", async () => {
    const row = fakeRow();
    mockQueryRaw.mockResolvedValue([row]);
    const result = await claimNextJob("extract");
    expect(result).toEqual(row);
  });

  it("returns null when no job is available (empty rows)", async () => {
    mockQueryRaw.mockResolvedValue([]);
    const result = await claimNextJob("extract");
    expect(result).toBeNull();
  });

  it("issues exactly one $queryRaw call per invocation", async () => {
    mockQueryRaw.mockResolvedValue([]);
    await claimNextJob("extract");
    expect(mockQueryRaw).toHaveBeenCalledTimes(1);
  });

  it("templates the SQL with the required claim primitives", async () => {
    mockQueryRaw.mockResolvedValue([]);
    await claimNextJob("extract");
    // $queryRaw is a tagged-template function. The first argument is the
    // strings array of literal SQL chunks; we assert key tokens appear so a
    // future refactor can't silently drop FOR UPDATE SKIP LOCKED, the status
    // filter, or the LIMIT.
    const [strings] = mockQueryRaw.mock.calls[0];
    const fullSql = (strings as TemplateStringsArray).join(" ");
    expect(fullSql).toMatch(/UPDATE\s+"DocumentProcessingJob"/i);
    expect(fullSql).toMatch(/status\s*=\s*'running'/i);
    expect(fullSql).toMatch(/attempts\s*=\s*attempts\s*\+\s*1/i);
    expect(fullSql).toMatch(/status\s*=\s*'pending'/i);
    expect(fullSql).toMatch(/FOR\s+UPDATE\s+SKIP\s+LOCKED/i);
    expect(fullSql).toMatch(/LIMIT\s+1/i);
    expect(fullSql).toMatch(/RETURNING\s+\*/i);
  });

  it("normalises `scheduledFor` to UTC before comparing to the now param (TZ-safety regression guard)", async () => {
    // Regression test for the 2026-06-25 bug surfaced by the β1.4 live
    // smoke: Prisma's schema stores DateTime as bare `timestamp` (no TZ),
    // and Postgres reinterprets bare timestamps in the session TZ when
    // comparing against `timestamptz` (which is what `${now}` and `NOW()`
    // bind as). On any non-UTC session (e.g. America/New_York), the
    // comparison `"scheduledFor" <= ${now}` shifts the column 4–5h into
    // the future and the poller never claims any row.
    //
    // The fix: force the column to be read as UTC via `AT TIME ZONE 'UTC'`
    // BEFORE the comparison. This test pins the cast so a future refactor
    // can't silently drop it and reintroduce the silent-no-claim bug.
    mockQueryRaw.mockResolvedValue([]);
    await claimNextJob("extract");
    const [strings] = mockQueryRaw.mock.calls[0];
    const fullSql = (strings as TemplateStringsArray).join(" ");
    expect(fullSql).toMatch(
      /"scheduledFor"\s+AT\s+TIME\s+ZONE\s+'UTC'/i,
    );
  });

  it("converts the now param to UTC before writing claimedAt/updatedAt (mirror TZ-safety guard)", async () => {
    // Mirror-image of the WHERE-side fix above: assigning a `timestamptz`
    // param to a bare `timestamp` column does the inverse implicit cast
    // (Postgres converts via session TZ then strips TZ), so `claimedAt`
    // ends up storing the session-local wall clock. Prisma reads it back
    // as a UTC instant, drifting it 4–5h from reality. Fix: wrap the now
    // param in `(${now} AT TIME ZONE 'UTC')` to preserve the UTC wall
    // clock through the write/read round-trip. Pinned here so a future
    // refactor can't strip the cast and silently corrupt audit
    // timestamps + the staleReset cutoff math.
    mockQueryRaw.mockResolvedValue([]);
    await claimNextJob("extract");
    const [strings] = mockQueryRaw.mock.calls[0];
    const fullSql = (strings as TemplateStringsArray).join(" ");
    // Match both `"claimedAt" = (<param> AT TIME ZONE 'UTC')` and the
    // same for `"updatedAt"`. The param itself is a $1/$2 placeholder
    // in the joined-strings view — what we assert is the AT TIME ZONE
    // 'UTC' suffix following the column name.
    expect(fullSql).toMatch(
      /"claimedAt"\s*=\s*\([^)]*AT\s+TIME\s+ZONE\s+'UTC'\)/i,
    );
    expect(fullSql).toMatch(
      /"updatedAt"\s*=\s*\([^)]*AT\s+TIME\s+ZONE\s+'UTC'\)/i,
    );
  });

  it("passes the kind discriminator and now timestamp as bound params", async () => {
    mockQueryRaw.mockResolvedValue([]);
    const now = new Date("2026-06-25T12:34:56Z");
    await claimNextJob("ocr-page", now);
    // Tagged-template args after the strings array are the interpolated
    // values, in order. We expect: claimedAt (now), updatedAt (now),
    // kind, scheduledFor cutoff (now) — exact order is implementation
    // detail, but `now` must be passed and `"ocr-page"` must appear.
    const call = mockQueryRaw.mock.calls[0];
    const params = call.slice(1);
    expect(params).toContain("ocr-page");
    // `now` should appear at least once (claimedAt / scheduledFor filter).
    expect(params.filter((p) => p instanceof Date && (p as Date).getTime() === now.getTime()).length).toBeGreaterThan(0);
  });

  it("defaults `now` to the current time when omitted", async () => {
    mockQueryRaw.mockResolvedValue([]);
    const before = Date.now();
    await claimNextJob("extract");
    const after = Date.now();
    const params = mockQueryRaw.mock.calls[0].slice(1);
    const dateParams = params.filter((p) => p instanceof Date) as Date[];
    expect(dateParams.length).toBeGreaterThan(0);
    for (const d of dateParams) {
      expect(d.getTime()).toBeGreaterThanOrEqual(before);
      expect(d.getTime()).toBeLessThanOrEqual(after);
    }
  });
});
