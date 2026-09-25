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
});
