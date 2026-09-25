import { afterEach, describe, expect, it, vi } from "vitest";
import { createApp } from "./app";
import { openDatabase } from "./db";

describe("job source settings", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("saves which sources are on and which career record parts a judgment may read", async () => {
    const app = createApp(openDatabase(":memory:"));
    const saved = await app.request("/api/job-sources", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        sources: [
          {
            id: "source-1",
            name: "USAJobs",
            applicationId: "",
            apiKey: "usajobs-key",
            enabled: true,
          },
        ],
        sites: [
          {
            id: "site-1",
            label: "Northstar",
            url: "https://northstar.example/careers",
            enabled: true,
          },
        ],
        judgment: ["history"],
      }),
    });
    expect(saved.status).toBe(200);
    const again = await app.request("/api/job-sources");
    expect(await again.json()).toMatchObject({
      settings: {
        judgment: ["history"],
        sources: [{ name: "USAJobs", apiKey: "usajobs-key" }],
        sites: [{ label: "Northstar" }],
      },
    });
  });

  it("searches with the key saved in the vault", async () => {
    vi.stubEnv("ADZUNA_APP_ID", "");
    vi.stubEnv("ADZUNA_APP_KEY", "");
    const fetchImpl = vi.fn(async () => Response.json({ count: 0, results: [] }));
    vi.stubGlobal("fetch", fetchImpl);
    const app = createApp(openDatabase(":memory:"));
    await app.request("/api/job-sources", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        sources: [
          {
            id: "source-1",
            name: "Adzuna",
            applicationId: "vault-id",
            apiKey: "vault-key",
            enabled: true,
          },
        ],
        sites: [],
        judgment: ["profile"],
      }),
    });
    const response = await app.request("/api/job-search?q=electrician&where=Clifton%20Heights");
    expect(response.status).toBe(200);
    const called = String((fetchImpl.mock.calls as unknown as Array<[string]>)[0]?.[0]);
    expect(called).toContain("app_id=vault-id");
    expect(JSON.stringify(await response.json())).not.toContain("vault-key");
  });

  it("does not call Adzuna when that source is off", async () => {
    vi.stubEnv("ADZUNA_APP_ID", "app");
    vi.stubEnv("ADZUNA_APP_KEY", "key");
    const fetchImpl = vi.fn();
    vi.stubGlobal("fetch", fetchImpl);
    const app = createApp(openDatabase(":memory:"));
    await app.request("/api/job-sources", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        sources: [
          {
            id: "source-1",
            name: "Adzuna",
            applicationId: "",
            apiKey: "",
            enabled: false,
          },
        ],
        sites: [],
        judgment: ["profile"],
      }),
    });
    const response = await app.request("/api/job-search?q=electrician&where=Clifton%20Heights");
    expect(await response.json()).toMatchObject({ configured: false, listings: [] });
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
