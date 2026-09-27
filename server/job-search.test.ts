import { afterEach, describe, expect, it, vi } from "vitest";
import { createApp } from "./app";
import { openDatabase } from "./db";

describe("job search HTTP seam", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("asks for a role or a place", async () => {
    const app = createApp(openDatabase(":memory:"));
    const response = await app.request("/api/job-search");
    expect(response.status).toBe(400);
  });

  it("keeps the map usable when listings are not configured", async () => {
    vi.stubEnv("ADZUNA_APP_ID", "");
    vi.stubEnv("ADZUNA_APP_KEY", "");
    const app = createApp(openDatabase(":memory:"));
    const response = await app.request(
      "/api/job-search?q=electrician&where=Clifton%20Heights",
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      configured: false,
      listings: [],
      total: 0,
    });
  });

  it("returns located listings from the search source", async () => {
    vi.stubEnv("ADZUNA_APP_ID", "app");
    vi.stubEnv("ADZUNA_APP_KEY", "key");
    const fetchImpl = vi.fn(async () =>
      Response.json({
        count: 1,
        results: [
          {
            id: "9",
            title: "Lead electrician",
            company: { display_name: "Northstar" },
            location: { display_name: "Clifton Heights, PA" },
            latitude: 39.92,
            longitude: -75.3,
            redirect_url: "https://example.test/lead",
            description: "Commercial fit-out",
          },
        ],
      }),
    );
    vi.stubGlobal("fetch", fetchImpl);
    const app = createApp(openDatabase(":memory:"));
    const response = await app.request(
      "/api/job-search?q=electrician&where=Clifton%20Heights&distance=15",
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      configured: boolean;
      listings: Array<{ title: string; latitude: number }>;
    };
    expect(body.configured).toBe(true);
    expect(body.listings[0]).toMatchObject({
      title: "Lead electrician",
      latitude: 39.92,
    });
    const called = String((fetchImpl.mock.calls as unknown as Array<[string]>)[0]?.[0]);
    expect(called).toContain("what=electrician");
    expect(called).toContain("distance=15");
    expect(called).toContain("app_key=");
    expect(JSON.stringify(body)).not.toContain("app_key");
  });

  it("judges a listing against the checked career record only", async () => {
    vi.stubEnv("ADZUNA_APP_ID", "app");
    vi.stubEnv("ADZUNA_APP_KEY", "key");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          count: 1,
          results: [
            {
              id: "9",
              title: "Electrician",
              company: { display_name: "Northstar" },
              location: { display_name: "Clifton Heights, PA" },
              latitude: 39.92,
              longitude: -75.3,
              description: "Daily blueprint reading for a zirconium welder crew",
            },
          ],
        }),
      ),
    );
    const db = openDatabase(":memory:");
    const app = createApp(db);
    await app.request("/api/job-sources", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sources: [], sites: [], judgment: ["skills"] }),
    });
    const now = new Date().toISOString();
    db.prepare(
      "INSERT INTO skills (id, occupant_id, name, created_at) VALUES (?, 'local', ?, ?)",
    ).run("skill-1", "blueprint reading", now);
    db.prepare(
      `INSERT INTO work_history
        (id, occupant_id, kind, title, company, created_at)
       VALUES ('role-1', 'local', 'job', 'Zirconium welder', 'Secret Co', ?)`,
    ).run(now);
    const response = await app.request("/api/job-search?q=electrician&where=Clifton%20Heights");
    const body = (await response.json()) as {
      listings: Array<{ fit: { summary: string } }>;
    };
    expect(body.listings[0]?.fit.summary).toBe("Lines up with blueprint reading.");
    expect(JSON.stringify(body)).not.toContain("Zirconium");
  });

  it("reads a saved company page into the same posting as a listing", async () => {
    vi.stubEnv("ADZUNA_APP_ID", "");
    vi.stubEnv("ADZUNA_APP_KEY", "");
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("nominatim")) {
        return Response.json([
          {
            lat: "39.92",
            lon: "-75.3",
            display_name: "Clifton Heights, PA",
            name: "Clifton Heights",
          },
        ]);
      }
      return new Response(
        `<h1>Careers</h1><h2>Lead Electrician</h2><p>Location: Clifton Heights, PA</p><p>Read blueprints daily.</p>`,
        { headers: { "content-type": "text/html" } },
      );
    });
    vi.stubGlobal("fetch", fetchImpl);
    const app = createApp(openDatabase(":memory:"));
    await app.request("/api/job-sources", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        sources: [],
        sites: [
          {
            id: "site-1",
            label: "Northstar",
            url: "https://northstar.example/careers",
            enabled: true,
          },
          {
            id: "site-2",
            label: "Closed",
            url: "https://closed.example/careers",
            enabled: false,
          },
        ],
        judgment: ["profile"],
      }),
    });
    const response = await app.request(
      "/api/job-search?q=electrician&where=Clifton%20Heights",
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      configured: boolean;
      listings: Array<{
        title: string;
        organization: string;
        description: string;
        latitude: number;
      }>;
    };
    expect(body.configured).toBe(true);
    expect(body.listings).toHaveLength(1);
    expect(body.listings[0]).toMatchObject({
      title: "Lead Electrician",
      organization: "Northstar",
      latitude: 39.92,
    });
    expect(body.listings[0]?.description).toContain("Read blueprints daily");
    const called = (fetchImpl.mock.calls as unknown as Array<[string]>).map((call) =>
      String(call[0]),
    );
    expect(called.some((url) => url.includes("northstar.example"))).toBe(true);
    expect(called.some((url) => url.includes("closed.example"))).toBe(false);
  });
});
