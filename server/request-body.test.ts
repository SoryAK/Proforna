import { describe, expect, it } from "vitest";
import { createRelayApp } from "../relay/app";
import { openRelayDatabase } from "../relay/db";
import { createApp } from "./app";
import { openDatabase } from "./db";

const json = { "content-type": "application/json" };

describe("bad request data answers 400, not 500", () => {
  const app = createApp(openDatabase(":memory:"));
  const put = (body: BodyInit | undefined, headers: Record<string, string> = json) =>
    app.request("/api/resume-asides", { method: "PUT", headers, body });

  it("refuses JSON that does not parse", async () => {
    const response = await put("{not json");
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "invalid-body" });
  });

  it("refuses JSON that is not an object or list", async () => {
    for (const body of ["null", "42", '"text"', "true"]) {
      const response = await put(body);
      expect(response.status, body).toBe(400);
    }
  });

  it("refuses a missing body on a route that needs JSON", async () => {
    const response = await app.request("/api/projections/missing/grants", { method: "POST" });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "invalid-body" });
  });

  it("refuses a broken form upload", async () => {
    const response = await app.request("/api/documents", {
      method: "POST",
      headers: { "content-type": "multipart/form-data; boundary=zz" },
      body: "--not-a-form",
    });
    expect(response.status).toBe(400);
  });

  it("still serves good requests", async () => {
    expect((await put(JSON.stringify({ asides: [] }))).status).toBe(200);
  });
});

describe("the relay answers bad request data with 400 too", () => {
  const relay = createRelayApp(openRelayDatabase(":memory:"), "owner-secret");

  it("refuses bad JSON from visitors and the owner", async () => {
    expect(
      (await relay.request("/r/systems/events", { method: "POST", headers: json, body: "{" })).status,
    ).toBe(400);
    expect(
      (
        await relay.request("/relay/publications/systems", {
          method: "PUT",
          headers: { ...json, authorization: "Bearer owner-secret" },
          body: "{",
        })
      ).status,
    ).toBe(400);
  });

  it("caps what a visitor can send", async () => {
    const response = await relay.request("/r/systems/events", {
      method: "POST",
      headers: json,
      body: JSON.stringify({ eventType: "section", section: "x".repeat(100_000) }),
    });
    expect(response.status).toBe(413);
  });

  it("keeps the MCP endpoint's own parse error", async () => {
    const response = await relay.request("/mcp", { method: "POST", headers: json, body: "{" });
    expect(response.status).toBe(400);
    expect(((await response.json()) as { error: { code: number } }).error.code).toBe(-32700);
  });
});
