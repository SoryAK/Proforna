import { describe, expect, it } from "vitest";
import { preparePlan } from "../core/career-management";
import { createApp } from "./app";
import { openDatabase } from "./db";

type Plan = { id: string; title: string; outcome: string; horizon: string; tasks: Array<{ title: string }> };

describe("reading a plan submission", () => {
  it("is the same for adding and changing", () => {
    expect(preparePlan({ title: "  Lead a team ", outcome: " Manage five " })).toEqual({
      ok: true,
      value: { title: "Lead a team", outcome: "Manage five", horizon: null, tasks: null },
    });
    expect(preparePlan({ title: "", outcome: "x" })).toEqual({ ok: false, error: "title-required" });
    expect(preparePlan(null)).toEqual({ ok: false, error: "title-required" });
    const withTasks = preparePlan({ title: "P", tasks: [{ title: "Ask" }, { title: "" }, "junk"] });
    expect(withTasks.ok && withTasks.value.tasks).toEqual([{ title: "Ask", dueOn: null }]);
  });
});

describe("career plans can be added, changed and removed", () => {
  const setup = () => {
    const db = openDatabase(":memory:");
    const app = createApp(db);
    const json = (method: string, body: unknown) => ({
      method,
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const plans = async () =>
      ((await (await app.request("/api/career-management")).json()) as { plans: Plan[] }).plans;
    return { db, app, json, plans };
  };

  it("changes a plan with the fields that add it, keeping what was not sent", async () => {
    const { db, app, json, plans } = setup();
    try {
      const created = await app.request(
        "/api/plans",
        json("POST", { title: "Lead", outcome: "Team of 3", horizon: "90 days", tasks: [{ title: "Ask boss" }] }),
      );
      expect(created.status).toBe(201);
      const { plan } = (await created.json()) as { plan: Plan };

      const changed = await app.request(`/api/plans/${plan.id}`, json("PUT", { title: "Lead a shift", outcome: "Team of 5" }));
      expect(changed.status).toBe(200);
      const [after] = await plans();
      expect(after).toMatchObject({ title: "Lead a shift", outcome: "Team of 5", horizon: "90 days" });
      expect(after.tasks.map((task) => task.title)).toEqual(["Ask boss"]);

      await app.request(`/api/plans/${plan.id}`, json("PUT", { title: "Lead a shift", tasks: [{ title: "Shadow" }] }));
      expect((await plans())[0].tasks.map((task) => task.title)).toEqual(["Shadow"]);
      // Leaving the outcome or the title out keeps them; sending them changes them.
      expect((await plans())[0].outcome).toBe("Team of 5");
      expect((await app.request(`/api/plans/${plan.id}`, json("PUT", { outcome: "Team of 6" }))).status).toBe(200);
      expect((await plans())[0]).toMatchObject({ title: "Lead a shift", outcome: "Team of 6" });
      await app.request(`/api/plans/${plan.id}`, json("PUT", { outcome: "" }));
      expect((await plans())[0].outcome).toBe("");
      expect((await app.request(`/api/plans/${plan.id}`, json("PUT", { title: "  " }))).status).toBe(400);
    } finally {
      db.close();
    }
  });

  it("refuses an empty title and an unknown plan", async () => {
    const { db, app, json } = setup();
    try {
      const { plan } = (await (await app.request("/api/plans", json("POST", { title: "Lead" }))).json()) as { plan: Plan };
      expect((await app.request(`/api/plans/${plan.id}`, json("PUT", { title: " " }))).status).toBe(400);
      expect((await app.request("/api/plans/nope", json("PUT", { title: "x" }))).status).toBe(404);
      expect((await app.request("/api/plans/nope", { method: "DELETE" })).status).toBe(404);
    } finally {
      db.close();
    }
  });

  it("removes a plan and its tasks", async () => {
    const { db, app, json, plans } = setup();
    try {
      const { plan } = (await (
        await app.request("/api/plans", json("POST", { title: "Lead", tasks: [{ title: "Ask" }] }))
      ).json()) as { plan: Plan };
      expect((await app.request(`/api/plans/${plan.id}`, { method: "DELETE" })).status).toBe(200);
      expect(await plans()).toEqual([]);
      const tasks = db.prepare("SELECT COUNT(*) AS n FROM career_tasks").get() as { n: number };
      expect(tasks.n).toBe(0);
    } finally {
      db.close();
    }
  });
});
