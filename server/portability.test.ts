import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createApp } from "./app";
import { openDatabase } from "./db";

describe("document portability", () => {
  it("exports and restores vault rows and files with checksums", async () => {
    const sourceDir = mkdtempSync(join(tmpdir(), "proforna-source-"));
    const targetDir = mkdtempSync(join(tmpdir(), "proforna-target-"));
    const sourceDb = openDatabase(":memory:");
    const targetDb = openDatabase(":memory:");
    const source = createApp(sourceDb, { uploadsDir: sourceDir });
    const target = createApp(targetDb, { uploadsDir: targetDir });
    try {
      const form = new FormData();
      form.set(
        "file",
        new File(["career evidence"], "retrospective.txt", {
          type: "text/plain",
        }),
      );
      form.set("category", "evidence");
      expect(
        (await source.request("/api/documents", { method: "POST", body: form }))
          .status,
      ).toBe(201);

      const archiveResponse = await source.request("/api/portability/export");
      expect(archiveResponse.status).toBe(200);
      const restoreForm = new FormData();
      restoreForm.set(
        "archive",
        new File(
          [await archiveResponse.arrayBuffer()],
          "proforna-export.zip",
          { type: "application/zip" },
        ),
      );
      const restored = await target.request("/api/portability/restore", {
        method: "POST",
        body: restoreForm,
      });
      expect(restored.status).toBe(200);

      const documents = (await (
        await target.request("/api/documents")
      ).json()) as { documents: Array<{ id: string; originalName: string }> };
      expect(documents.documents[0].originalName).toBe("retrospective.txt");
      const downloaded = await target.request(
        `/api/documents/${documents.documents[0].id}`,
      );
      expect(await downloaded.text()).toBe("career evidence");
    } finally {
      sourceDb.close();
      targetDb.close();
      rmSync(sourceDir, { recursive: true, force: true });
      rmSync(targetDir, { recursive: true, force: true });
    }
  });

  it("configures adapter metadata without accepting embedded secrets", async () => {
    const db = openDatabase(":memory:");
    const app = createApp(db);
    try {
      expect(
        (
          await app.request("/api/integrations", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              kind: "calendar",
              label: "Work calendar",
              config: { calendarId: "primary" },
            }),
          })
        ).status,
      ).toBe(201);
      expect(
        (
          await app.request("/api/integrations", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              kind: "email",
              label: "Inbox",
              config: { accessToken: "do-not-store" },
            }),
          })
        ).status,
      ).toBe(400);
    } finally {
      db.close();
    }
  });
});
