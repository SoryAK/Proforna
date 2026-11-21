import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "./app";
import { DEFAULT_BODY_MAX_BYTES, UPLOAD_MAX_BYTES, bodyLimitFor } from "./body-limits";
import { openDatabase } from "./db";
import { MAX_RESTORE_ARCHIVE_BYTES } from "./portability";

const MB = 1024 * 1024;

describe("request size limits", () => {
  let dir: string;
  let db: ReturnType<typeof openDatabase>;
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "proforna-limits-"));
    db = openDatabase(":memory:");
    app = createApp(db, { uploadsDir: dir });
  });
  afterEach(() => {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  });

  const upload = (path: string, field: string, size: number) => {
    const form = new FormData();
    form.set(field, new File([new Uint8Array(size)], "file.pdf", { type: "application/pdf" }));
    return app.request(path, { method: "POST", body: form });
  };

  it("gives uploads their own caps and everything else a small one", () => {
    expect(bodyLimitFor("/api/documents")).toBeGreaterThan(UPLOAD_MAX_BYTES);
    expect(bodyLimitFor("/api/resumes/extract")).toBeGreaterThan(UPLOAD_MAX_BYTES);
    expect(bodyLimitFor("/api/work-map/roles/abc/photos")).toBeLessThan(UPLOAD_MAX_BYTES);
    expect(bodyLimitFor("/api/portability/restore")).toBeGreaterThan(MAX_RESTORE_ARCHIVE_BYTES);
    expect(bodyLimitFor("/api/history")).toBe(DEFAULT_BODY_MAX_BYTES);
  });

  it("turns away an oversized JSON request", async () => {
    const response = await app.request("/api/resume-asides", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: "x".repeat(DEFAULT_BODY_MAX_BYTES + 10) }),
    });
    expect(response.status).toBe(413);
  });

  it("turns away an oversized body that does not say its length up front", async () => {
    const chunk = new Uint8Array(MB);
    let sent = 0;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (sent >= 10) return controller.close();
        sent += 1;
        controller.enqueue(chunk);
      },
    });
    const response = await app.request("/api/resume-asides", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body,
      duplex: "half",
    } as RequestInit);
    expect(response.status).toBe(413);
    // It stopped reading early rather than taking all 10 MB.
    expect(sent).toBeLessThan(10);
  });

  it("turns away a document over 25 MB and stores nothing", async () => {
    const response = await upload("/api/documents", "file", UPLOAD_MAX_BYTES + MB + 10);
    expect(response.status).toBe(413);
    expect(readdirSync(dir)).toEqual([]);
  });

  it("turns away a resume over 25 MB", async () => {
    const response = await upload("/api/resumes", "file", UPLOAD_MAX_BYTES + 10);
    expect(response.status).toBe(413);
    expect(readdirSync(dir)).toEqual([]);
  });

  it("still accepts a normal upload and a restore larger than the JSON cap", async () => {
    expect((await upload("/api/documents", "file", 3 * MB)).status).toBe(201);
    // Not a real archive, so it is refused as invalid, not as too large.
    const restore = await upload("/api/portability/restore", "archive", 3 * MB);
    expect(restore.status).toBe(400);
  });
});
