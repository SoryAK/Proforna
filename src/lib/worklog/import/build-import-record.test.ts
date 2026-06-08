/**
 * RED tests for buildWorkLogImportRecord — Sprint 2 of worklog import.
 *
 * Contract: assemble the data payload for prisma.workLogImport.create().
 * Pure function — no Prisma, no IO. Just normalization + defaults.
 *
 * Written BEFORE the implementation exists. MUST fail on first run.
 * Phase 2.5 — TDD Iron Law.
 */

import { buildWorkLogImportRecord } from "@/lib/worklog/import/build-import-record";

describe("buildWorkLogImportRecord — required fields", () => {
  it("returns userId, sourceType, sourceFingerprint verbatim", () => {
    const record = buildWorkLogImportRecord({
      userId: "user-1",
      sourceType: "markdown",
      sourceFingerprint: "abc123",
      droppedBlocks: [],
    });
    expect(record.userId).toBe("user-1");
    expect(record.sourceType).toBe("markdown");
    expect(record.sourceFingerprint).toBe("abc123");
  });

  it("rejects unknown sourceType strings", () => {
    expect(() =>
      buildWorkLogImportRecord({
        userId: "user-1",
        sourceType: "telepathy" as unknown as "markdown",
        sourceFingerprint: "abc",
        droppedBlocks: [],
      }),
    ).toThrow(/sourceType/i);
  });

  it("accepts 'markdown' and 'html' as valid sourceType values", () => {
    expect(() =>
      buildWorkLogImportRecord({
        userId: "u",
        sourceType: "markdown",
        sourceFingerprint: "f",
        droppedBlocks: [],
      }),
    ).not.toThrow();
    expect(() =>
      buildWorkLogImportRecord({
        userId: "u",
        sourceType: "html",
        sourceFingerprint: "f",
        droppedBlocks: [],
      }),
    ).not.toThrow();
  });
});

describe("buildWorkLogImportRecord — defaults", () => {
  it("defaults status to 'pending' when not provided", () => {
    const record = buildWorkLogImportRecord({
      userId: "u",
      sourceType: "markdown",
      sourceFingerprint: "f",
      droppedBlocks: [],
    });
    expect(record.status).toBe("pending");
  });

  it("defaults workLogId, errorMessage, sourceFilename, completedAt to null/undefined", () => {
    const record = buildWorkLogImportRecord({
      userId: "u",
      sourceType: "markdown",
      sourceFingerprint: "f",
      droppedBlocks: [],
    });
    expect(record.workLogId ?? null).toBeNull();
    expect(record.errorMessage ?? null).toBeNull();
    expect(record.sourceFilename ?? null).toBeNull();
    expect(record.completedAt ?? null).toBeNull();
  });
});

describe("buildWorkLogImportRecord — overrides", () => {
  it("accepts an explicit 'pending' status (the default, asserted via override)", () => {
    // Using 'pending' here keeps the test focused on status pass-through
    // without entangling the succeeded/failed invariants exercised below.
    const r = buildWorkLogImportRecord({
      userId: "u",
      sourceType: "markdown",
      sourceFingerprint: "f",
      droppedBlocks: [],
      status: "pending",
    });
    expect(r.status).toBe("pending");
  });

  it("rejects an unknown status value", () => {
    expect(() =>
      buildWorkLogImportRecord({
        userId: "u",
        sourceType: "markdown",
        sourceFingerprint: "f",
        droppedBlocks: [],
        status: "running" as unknown as "succeeded",
      }),
    ).toThrow(/status/i);
  });

  it("carries through sourceFilename when provided", () => {
    const r = buildWorkLogImportRecord({
      userId: "u",
      sourceType: "html",
      sourceFingerprint: "f",
      droppedBlocks: [],
      sourceFilename: "apple-notes.html",
    });
    expect(r.sourceFilename).toBe("apple-notes.html");
  });

  it("trims sourceFilename whitespace and rejects empty string", () => {
    const r = buildWorkLogImportRecord({
      userId: "u",
      sourceType: "html",
      sourceFingerprint: "f",
      droppedBlocks: [],
      sourceFilename: "  foo.md  ",
    });
    expect(r.sourceFilename).toBe("foo.md");

    const empty = buildWorkLogImportRecord({
      userId: "u",
      sourceType: "html",
      sourceFingerprint: "f",
      droppedBlocks: [],
      sourceFilename: "   ",
    });
    expect(empty.sourceFilename ?? null).toBeNull();
  });

  it("carries through workLogId + completedAt for a succeeded import", () => {
    const at = new Date("2026-06-08T12:00:00Z");
    const r = buildWorkLogImportRecord({
      userId: "u",
      sourceType: "markdown",
      sourceFingerprint: "f",
      droppedBlocks: [],
      status: "succeeded",
      workLogId: "log-1",
      completedAt: at,
    });
    expect(r.workLogId).toBe("log-1");
    expect(r.completedAt).toEqual(at);
    expect(r.status).toBe("succeeded");
  });

  it("carries through errorMessage for a failed import", () => {
    const r = buildWorkLogImportRecord({
      userId: "u",
      sourceType: "markdown",
      sourceFingerprint: "f",
      droppedBlocks: [],
      status: "failed",
      errorMessage: "parse error: unexpected EOF",
    });
    expect(r.errorMessage).toBe("parse error: unexpected EOF");
    expect(r.status).toBe("failed");
  });
});

describe("buildWorkLogImportRecord — droppedBlocks", () => {
  it("serializes a non-empty droppedBlocks array verbatim", () => {
    const dropped = [{ type: "html:script", count: 2 }];
    const r = buildWorkLogImportRecord({
      userId: "u",
      sourceType: "html",
      sourceFingerprint: "f",
      droppedBlocks: dropped,
    });
    expect(r.droppedBlocks).toEqual(dropped);
  });

  it("serializes an empty droppedBlocks array as an empty array (not null)", () => {
    // Empty array carries meaning: "we checked, nothing dropped".
    // null would mean "we don't know" — only used for legacy rows.
    const r = buildWorkLogImportRecord({
      userId: "u",
      sourceType: "markdown",
      sourceFingerprint: "f",
      droppedBlocks: [],
    });
    expect(r.droppedBlocks).toEqual([]);
  });
});

describe("buildWorkLogImportRecord — invariants", () => {
  it("rejects empty userId", () => {
    expect(() =>
      buildWorkLogImportRecord({
        userId: "",
        sourceType: "markdown",
        sourceFingerprint: "f",
        droppedBlocks: [],
      }),
    ).toThrow(/userId/i);
  });

  it("rejects empty sourceFingerprint", () => {
    expect(() =>
      buildWorkLogImportRecord({
        userId: "u",
        sourceType: "markdown",
        sourceFingerprint: "",
        droppedBlocks: [],
      }),
    ).toThrow(/sourceFingerprint/i);
  });

  it("rejects 'succeeded' status without a workLogId", () => {
    expect(() =>
      buildWorkLogImportRecord({
        userId: "u",
        sourceType: "markdown",
        sourceFingerprint: "f",
        droppedBlocks: [],
        status: "succeeded",
        // missing workLogId
      }),
    ).toThrow(/workLogId/i);
  });

  it("rejects 'failed' status without an errorMessage", () => {
    expect(() =>
      buildWorkLogImportRecord({
        userId: "u",
        sourceType: "markdown",
        sourceFingerprint: "f",
        droppedBlocks: [],
        status: "failed",
        // missing errorMessage
      }),
    ).toThrow(/errorMessage/i);
  });
});
