import { describe, expect, it } from "vitest";
import { createRelayApp } from "./app";
import { openRelayDatabase } from "./db";

const projection = {
  id: "projection-1",
  slug: "systems",
  visibility: "public",
  targetRole: "Principal Systems Engineer",
  theme: "dark",
  profile: {
    displayName: "Sory Kaba",
    headline: "Systems leader",
    city: "Philadelphia",
    state: "PA",
    bio: "Evidence-backed systems leader.",
    links: { linkedin: "", github: "", portfolio: "" },
  },
  roles: [
    {
      id: "role-1",
      kind: "job",
      title: "Lead Systems Engineer",
      organization: "Acme",
      span: "2024 — Present",
      description: "",
      achievements: ["Cut recovery from 42 to 11 minutes."],
      locations: [
        {
          id: "location-1",
          label: "Plant",
          address: "",
          latitude: 39.95,
          longitude: -75.16,
          kind: "primary",
          isPublic: true,
        },
      ],
      media: [],
      milestones: [],
      events: [],
      techStack: ["PLC"],
      skills: [],
    },
  ],
  skills: ["Incident leadership"],
  sections: ["profile", "history", "map", "skills"],
  expiresAt: null,
  sourceFingerprint: "abc",
  createdAt: "2026-09-19T20:00:00.000Z",
};

describe("publishing relay", () => {
  it("lets an agent read the same snapshot a person opens", async () => {
    const db = openRelayDatabase(":memory:");
    const app = createRelayApp(db, "owner-secret");
    try {
      const published = {
        ...projection,
        profile: { ...projection.profile, bio: "Kept the line running through the night." },
      };
      await app.request("/relay/publications/systems", {
        method: "PUT",
        headers: {
          authorization: "Bearer owner-secret",
          "content-type": "application/json",
        },
        body: JSON.stringify({ projection: published }),
      });

      const read = await mcp(app, {
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: {
          name: "read_publication",
          arguments: { slug: "systems" },
        },
      });
      expect(read.status).toBe(200);
      const body = (await read.json()) as {
        result: { isError: boolean; content: Array<{ text: string }> };
      };
      expect(body.result.isError).toBe(false);
      expect(body.result.content[0]?.text).toContain(
        "Kept the line running through the night.",
      );
      expect(body.result.content[0]?.text).toContain(
        "Cut recovery from 42 to 11 minutes.",
      );
      expect(body.result.content[0]?.text).not.toContain("occupantId");

      const analytics = await app.request("/relay/publications/systems/analytics", {
        headers: { authorization: "Bearer owner-secret" },
      });
      const stats = (await analytics.json()) as {
        events: Array<{ event_type: string }>;
      };
      expect(stats.events).toEqual(
        expect.arrayContaining([expect.objectContaining({ event_type: "read" })]),
      );

      await app.request("/relay/publications/systems", {
        method: "DELETE",
        headers: { authorization: "Bearer owner-secret" },
      });
      const revoked = await mcp(app, {
        jsonrpc: "2.0",
        id: 2,
        method: "tools/call",
        params: {
          name: "read_publication",
          arguments: { slug: "systems" },
        },
      });
      const revokedBody = (await revoked.json()) as {
        result: { isError: boolean; content: Array<{ text: string }> };
      };
      expect(revokedBody.result.isError).toBe(true);
      expect(revokedBody.result.content[0]?.text).toBe(
        "This publication is not available.",
      );
      expect((await app.request("/r/systems")).status).toBe(404);
    } finally {
      db.close();
    }
  });

  it("requires the same access token the page requires", async () => {
    const db = openRelayDatabase(":memory:");
    const app = createRelayApp(db, "owner-secret");
    try {
      await app.request("/relay/publications/systems", {
        method: "PUT",
        headers: {
          authorization: "Bearer owner-secret",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          projection: {
            ...projection,
            visibility: "access-controlled",
            profile: { ...projection.profile, bio: "Shared with a token." },
          },
        }),
      });
      const refused = await mcp(app, {
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: {
          name: "read_publication",
          arguments: { slug: "systems" },
        },
      });
      const refusedBody = (await refused.json()) as {
        result: { content: Array<{ text: string }> };
      };
      expect(refusedBody.result.content[0]?.text).toBe(
        "This publication requires an access token.",
      );
      expect(refusedBody.result.content[0]?.text).not.toContain("Shared with a token.");

      await app.request("/relay/publications/systems/grants", {
        method: "POST",
        headers: {
          authorization: "Bearer owner-secret",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          token: "viewer-token",
          expiresAt: "2099-01-01T00:00:00.000Z",
        }),
      });
      const allowed = await mcp(app, {
        jsonrpc: "2.0",
        id: 2,
        method: "tools/call",
        params: {
          name: "read_publication",
          arguments: { slug: "systems", token: "viewer-token" },
        },
      });
      const allowedBody = (await allowed.json()) as {
        result: { isError: boolean; content: Array<{ text: string }> };
      };
      expect(allowedBody.result.isError).toBe(false);
      expect(allowedBody.result.content[0]?.text).toContain("Shared with a token.");
    } finally {
      db.close();
    }
  });

  it("answers a current agent on the publication endpoint", async () => {
    const db = openRelayDatabase(":memory:");
    const app = createRelayApp(db, "owner-secret");
    try {
      expect((await app.request("/mcp")).status).toBe(405);
      const foreign = await mcp(
        app,
        {
          jsonrpc: "2.0",
          id: 1,
          method: "server/discover",
          params: modernMeta(),
        },
        {
          origin: "https://evil.example",
          host: "localhost",
          "mcp-protocol-version": "2026-07-28",
          "mcp-method": "server/discover",
        },
      );
      expect(foreign.status).toBe(403);

      const discover = await mcp(
        app,
        {
          jsonrpc: "2.0",
          id: 2,
          method: "server/discover",
          params: modernMeta(),
        },
        {
          "mcp-protocol-version": "2026-07-28",
          "mcp-method": "server/discover",
        },
      );
      const discovered = (await discover.json()) as {
        result: { supportedVersions: string[]; capabilities: { tools: unknown } };
      };
      expect(discovered.result.supportedVersions).toContain("2026-07-28");
      expect(discovered.result.capabilities.tools).toEqual({});

      await app.request("/relay/publications/systems", {
        method: "PUT",
        headers: {
          authorization: "Bearer owner-secret",
          "content-type": "application/json",
        },
        body: JSON.stringify({ projection }),
      });
      const mismatch = await mcp(
        app,
        {
          jsonrpc: "2.0",
          id: 3,
          method: "tools/call",
          params: {
            ...modernMeta(),
            name: "read_publication",
            arguments: { slug: "systems" },
          },
        },
        {
          "mcp-protocol-version": "2026-07-28",
          "mcp-method": "tools/call",
          "mcp-name": "other-tool",
        },
      );
      expect(mismatch.status).toBe(400);

      const read = await mcp(
        app,
        {
          jsonrpc: "2.0",
          id: 4,
          method: "tools/call",
          params: {
            ...modernMeta(),
            name: "read_publication",
            arguments: { slug: "systems" },
          },
        },
        {
          "mcp-protocol-version": "2026-07-28",
          "mcp-method": "tools/call",
          "mcp-name": "read_publication",
        },
      );
      const body = (await read.json()) as {
        result: {
          resultType: string;
          structuredContent: { roles: Array<{ achievements: string[] }> };
        };
      };
      expect(body.result.resultType).toBe("complete");
      expect(body.result.structuredContent.roles[0]?.achievements).toEqual([
        "Cut recovery from 42 to 11 minutes.",
      ]);
    } finally {
      db.close();
    }
  });

  it("publishes a minimized bundle and blocks access after revocation", async () => {
    const db = openRelayDatabase(":memory:");
    const app = createRelayApp(db, "owner-secret");
    try {
      const publish = await app.request("/relay/publications/systems", {
        method: "PUT",
        headers: {
          authorization: "Bearer owner-secret",
          "content-type": "application/json",
        },
        body: JSON.stringify({ projection }),
      });
      expect(publish.status).toBe(201);

      const publicPage = await app.request("/r/systems?view=journey");
      expect(publicPage.status).toBe(200);
      expect(await publicPage.text()).toContain("Cut recovery");

      const revoke = await app.request("/relay/publications/systems", {
        method: "DELETE",
        headers: { authorization: "Bearer owner-secret" },
      });
      expect(revoke.status).toBe(200);
      expect((await app.request("/r/systems")).status).toBe(404);
    } finally {
      db.close();
    }
  });

  it("offers an access request instead of exposing a protected map", async () => {
    const db = openRelayDatabase(":memory:");
    const app = createRelayApp(db, "owner-secret");
    try {
      await app.request("/relay/publications/systems", {
        method: "PUT",
        headers: {
          authorization: "Bearer owner-secret",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          projection: { ...projection, visibility: "access-controlled" },
        }),
      });
      const page = await app.request("/r/systems");
      expect(page.status).toBe(403);
      expect(await page.text()).toContain("Request access");
      expect(
        (
          await app.request("/r/systems/requests", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              name: "Recruiter",
              email: "recruiter@example.com",
            }),
          })
        ).status,
      ).toBe(201);
    } finally {
      db.close();
    }
  });
});

function modernMeta() {
  return {
    _meta: {
      "io.modelcontextprotocol/protocolVersion": "2026-07-28",
      "io.modelcontextprotocol/clientInfo": { name: "test", version: "0" },
      "io.modelcontextprotocol/clientCapabilities": {},
    },
  };
}

async function mcp(
  app: ReturnType<typeof createRelayApp>,
  body: unknown,
  headers: Record<string, string> = {},
) {
  return app.request("/mcp", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      ...headers,
    },
    body: JSON.stringify(body),
  });
}
