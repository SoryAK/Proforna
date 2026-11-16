import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createApp } from "./app";
import { openDatabase } from "./db";

describe("document vault", () => {
  it("renames a stored file and removes it", async () => {
    const uploadsDir = mkdtempSync(join(tmpdir(), "proforna-docs-"));
    const app = createApp(openDatabase(":memory:"), { uploadsDir });
    try {
      const form = new FormData();
      form.set("file", new File(["notes"], "notes.txt", { type: "text/plain" }));
      form.set("category", "evidence");
      const created = (await (await app.request("/api/documents", { method: "POST", body: form })).json()) as {
        document: { id: string };
      };

      const renamed = await app.request(`/api/documents/${created.document.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: "Offer letter", kind: "offer" }),
      });
      expect(renamed.status).toBe(200);
      const listed = (await (await app.request("/api/documents")).json()) as {
        documents: Array<{ originalName: string; category: string }>;
      };
      expect(listed.documents[0]).toMatchObject({ originalName: "Offer letter", category: "offer" });

      const removed = await app.request(`/api/documents/${created.document.id}`, { method: "DELETE" });
      expect(removed.status).toBe(200);
      const after = (await (await app.request("/api/documents")).json()) as { documents: unknown[] };
      expect(after.documents).toEqual([]);

      const picture = new FormData();
      picture.set("file", new File([Uint8Array.from([137, 80, 78, 71])], "still.png", { type: "application/octet-stream" }));
      picture.set("category", "evidence");
      const stored = (await (await app.request("/api/documents", { method: "POST", body: picture })).json()) as {
        document: { id: string };
      };
      const inline = await app.request(`/api/documents/${stored.document.id}?inline=1`);
      expect(inline.headers.get("content-type")).toBe("image/png");
      expect(inline.headers.get("content-disposition")).toContain("inline");
    } finally {
      rmSync(uploadsDir, { recursive: true, force: true });
    }
  });
});
