import { describe, expect, it } from "vitest";
import { createApp } from "./app";
import { openDatabase } from "./db";
import { isLocalHostname } from "./local-guard";

async function health(headers: Record<string, string>) {
  const db = openDatabase(":memory:");
  try {
    const res = await createApp(db).request("/api/health", { headers });
    return res.status;
  } finally {
    db.close();
  }
}

describe("local request guard", () => {
  it("lets this machine and the home network in", async () => {
    expect(await health({ host: "localhost:3000" })).toBe(200);
    expect(await health({ host: "127.0.0.1:3000" })).toBe(200);
    expect(
      await health({
        host: "192.168.1.168:5173",
        origin: "http://192.168.1.168:5173",
      }),
    ).toBe(200);
  });

  it("turns away other site names, which is how DNS rebinding arrives", async () => {
    expect(await health({ host: "evil.example:3000" })).toBe(403);
  });

  it("turns away requests sent by pages on other sites", async () => {
    expect(
      await health({ host: "localhost:3000", origin: "https://evil.example" }),
    ).toBe(403);
    expect(await health({ host: "localhost:3000", origin: "null" })).toBe(403);
  });

  it("knows which addresses are local", () => {
    for (const ok of ["localhost", "127.0.0.1", "::1", "[::1]", "10.0.0.4", "172.20.1.1", "192.168.1.168", "fd12:3456::1"]) {
      expect(isLocalHostname(ok), ok).toBe(true);
    }
    for (const no of ["example.com", "8.8.8.8", "172.32.0.1", "192.169.0.1", "localhost.evil.com", "999.1.1.1"]) {
      expect(isLocalHostname(no), no).toBe(false);
    }
  });
});
