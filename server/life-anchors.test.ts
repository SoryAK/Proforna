import { describe, expect, it } from "vitest";
import { createApp } from "./app";
import { openDatabase } from "./db";

describe("life anchors", () => {
  it("saves a place and removes it", async () => {
    const app = createApp(openDatabase(":memory:"));
    const created = await app.request("/api/life-anchors", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        label: "Kids' school",
        icon: "school",
        address: "100 School Lane, Clifton Heights, PA",
        latitude: 39.92,
        longitude: -75.3,
        weight: 4,
      }),
    });
    expect(created.status).toBe(201);
    const { anchor } = (await created.json()) as { anchor: { id: string; weight: number } };
    expect(anchor.weight).toBe(4);

    const listed = await app.request("/api/life-anchors");
    const body = (await listed.json()) as { anchors: Array<{ id: string }> };
    expect(body.anchors.map((item) => item.id)).toEqual([anchor.id]);

    const changed = await app.request(`/api/life-anchors/${anchor.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        label: "School",
        icon: "school",
        address: "100 School Lane, Clifton Heights, PA",
        latitude: 39.92,
        longitude: -75.3,
        weight: 5,
      }),
    });
    expect(changed.status).toBe(200);
    const updated = (await changed.json()) as { anchor: { label: string; weight: number } };
    expect(updated.anchor).toMatchObject({ label: "School", weight: 5 });

    const removed = await app.request(`/api/life-anchors/${anchor.id}`, { method: "DELETE" });
    expect(removed.status).toBe(200);
    const after = (await (await app.request("/api/life-anchors")).json()) as {
      anchors: unknown[];
    };
    expect(after.anchors).toEqual([]);
  });
});
