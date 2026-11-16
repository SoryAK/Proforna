import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
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
      const renamedPicture = await app.request(`/api/documents/${stored.document.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: "Scan", kind: "evidence" }),
      });
      expect(renamedPicture.status).toBe(200);
      const pictureRow = (await renamedPicture.json()) as { document: { mediaType: string } };
      expect(pictureRow.document.mediaType).toBe("image/png");
      const inline = await app.request(`/api/documents/${stored.document.id}?inline=1`);
      expect(inline.headers.get("content-type")).toBe("image/png");
      expect(inline.headers.get("content-disposition")).toContain("inline");
      expect(inline.headers.get("x-content-type-options")).toBe("nosniff");

      const odd = new FormData();
      odd.set("file", new File(["notes"], "notes.__proto__", { type: "application/octet-stream" }));
      const oddStored = (await (await app.request("/api/documents", { method: "POST", body: odd })).json()) as {
        document: { mediaType: string };
      };
      expect(oddStored.document.mediaType).toBe("application/octet-stream");

      const broken = await app.request(`/api/documents/${created.document.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: "{",
      });
      expect(broken.status).toBe(400);
      expect(((await broken.json()) as { error: string }).error).toBe("invalid-body");
      const emptyBody = await app.request(`/api/documents/${created.document.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: "null",
      });
      expect(emptyBody.status).toBe(400);
      expect(((await emptyBody.json()) as { error: string }).error).toBe("invalid-body");
    } finally {
      rmSync(uploadsDir, { recursive: true, force: true });
    }
  });

  it("keeps a file when cleanup fails and ignores one that is already gone", async () => {
    const uploadsDir = mkdtempSync(join(tmpdir(), "proforna-docs-"));
    const db = openDatabase(":memory:");
    const app = createApp(db, { uploadsDir });
    try {
      const form = new FormData();
      form.set("file", new File(["notes"], "notes.txt", { type: "text/plain" }));
      const created = (await (await app.request("/api/documents", { method: "POST", body: form })).json()) as {
        document: { id: string };
      };
      db.prepare("UPDATE documents SET stored_name = ? WHERE id = ?").run(".", created.document.id);
      const blocked = await app.request(`/api/documents/${created.document.id}`, { method: "DELETE" });
      expect(blocked.status).toBe(500);
      const stillThere = (await (await app.request("/api/documents")).json()) as { documents: unknown[] };
      expect(stillThere.documents).toHaveLength(1);

      db.prepare("UPDATE documents SET stored_name = ? WHERE id = ?").run(
        "documents/already-gone.txt",
        created.document.id,
      );
      const removed = await app.request(`/api/documents/${created.document.id}`, { method: "DELETE" });
      expect(removed.status).toBe(200);
      const after = (await (await app.request("/api/documents")).json()) as { documents: unknown[] };
      expect(after.documents).toEqual([]);
    } finally {
      db.close();
      rmSync(uploadsDir, { recursive: true, force: true });
    }
  });

  it("does not follow a stored name outside the upload folder", async () => {
    const uploadsDir = mkdtempSync(join(tmpdir(), "proforna-docs-"));
    const outside = join(dirname(uploadsDir), "proforna-outside.txt");
    const db = openDatabase(":memory:");
    const app = createApp(db, { uploadsDir });
    try {
      writeFileSync(outside, "keep");
      const form = new FormData();
      form.set("file", new File(["<script>bad</script>"], "evil.pdf", { type: "text/html" }));
      const created = (await (await app.request("/api/documents", { method: "POST", body: form })).json()) as {
        document: { id: string; mediaType: string };
      };
      expect(created.document.mediaType).toBe("text/plain; charset=utf-8");
      const inline = await app.request(`/api/documents/${created.document.id}?inline=1`);
      expect(inline.headers.get("content-type")).toBe("text/plain; charset=utf-8");

      db.prepare("UPDATE documents SET stored_name = ? WHERE id = ?").run("../proforna-outside.txt", created.document.id);
      const downloaded = await app.request(`/api/documents/${created.document.id}`);
      expect(downloaded.status).toBe(404);
      const removed = await app.request(`/api/documents/${created.document.id}`, { method: "DELETE" });
      expect(removed.status).toBe(200);
      expect(existsSync(outside)).toBe(true);
    } finally {
      db.close();
      rmSync(uploadsDir, { recursive: true, force: true });
      rmSync(outside, { force: true });
    }
  });
});
