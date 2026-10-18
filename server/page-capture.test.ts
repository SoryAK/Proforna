import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { describe, expect, it } from "vitest";
import { fetchPublicPage } from "./page-capture";

describe("linked page capture", () => {
  it("refuses pages on this machine by address or by name", async () => {
    let reached = false;
    const server = createServer((_request, response) => {
      reached = true;
      response.end("<title>private</title>");
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const { port } = server.address() as AddressInfo;
    try {
      for (const url of [
        `http://127.0.0.1:${port}/`,
        `http://localhost:${port}/`,
        `http://[::1]:${port}/`,
        "file:///etc/passwd",
      ]) {
        await expect(fetchPublicPage(url)).rejects.toMatchObject({ code: "page-blocked" });
      }
      expect(reached).toBe(false);
    } finally {
      server.close();
    }
  });
});
