import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { gzipSync } from "node:zlib";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  PublicPageError,
  isPublicAddress,
  isReadableWebUrl,
  readPublicPage,
  type ReadPublicPageOptions,
} from "./public-page";

// A real server on this machine stands in for "a site on the internet". The
// tests pretend 127.0.0.1 is public and every other private address is not.
let server: Server;
let port: number;
let redirectBodyClosed = false;

beforeAll(async () => {
  server = createServer((req, res) => {
    if (req.url === "/page") {
      res.writeHead(200, { "content-type": "text/html" });
      res.end("<h1>Careers</h1>");
    } else if (req.url === "/to-internal") {
      res.writeHead(302, { location: `http://internal.test:${port}/page` });
      res.end();
    } else if (req.url === "/to-literal") {
      res.writeHead(302, { location: `http://10.0.0.5:${port}/page` });
      res.end();
    } else if (req.url === "/to-page") {
      res.writeHead(301, { location: "/page" });
      res.end();
    } else if (req.url === "/loop") {
      res.writeHead(302, { location: "/loop" });
      res.end();
    } else if (req.url === "/huge") {
      res.writeHead(200, { "content-type": "text/plain" });
      res.end("x".repeat(50_000));
    } else if (req.url === "/gzip") {
      res.writeHead(200, { "content-type": "text/html", "content-encoding": "gzip" });
      res.end(gzipSync("<h1>Compressed careers</h1>" + "y".repeat(50_000)));
    } else if (req.url === "/trickle") {
      // One byte at a time, never silent long enough to trip the socket timeout.
      res.writeHead(200, { "content-type": "text/plain" });
      const tick = setInterval(() => res.write("."), 50);
      res.on("close", () => clearInterval(tick));
    } else if (req.url === "/streaming-redirect") {
      // A redirect whose body never ends.
      res.writeHead(302, { location: "/page" });
      const tick = setInterval(() => res.write("."), 20);
      res.on("close", () => {
        clearInterval(tick);
        redirectBodyClosed = true;
      });
    }
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  port = (server.address() as AddressInfo).port;
});
afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

const dns: Record<string, string[]> = {
  "careers.test": ["127.0.0.1"],
  "internal.test": ["10.0.0.5"],
  "mixed.test": ["127.0.0.1", "192.168.1.1"],
};
const options: ReadPublicPageOptions = {
  resolve: async (hostname) => dns[hostname] ?? [],
  allowAddress: (address) => address === "127.0.0.1",
};
const read = (path: string, host = "careers.test", extra: ReadPublicPageOptions = {}) =>
  readPublicPage(`http://${host}:${port}${path}`, { ...options, ...extra });
const failure = (run: Promise<unknown>) =>
  run.then(
    () => "ok",
    (error: unknown) => (error instanceof PublicPageError ? error.code : String(error)),
  );

describe("reading a public page", () => {
  it("reads a page and follows a redirect to the same site", async () => {
    expect((await read("/page")).text).toBe("<h1>Careers</h1>");
    const followed = await read("/to-page");
    expect(followed.status).toBe(200);
    expect(followed.text).toBe("<h1>Careers</h1>");
  });

  it("refuses a name that points to an internal address", async () => {
    expect(await failure(read("/page", "internal.test"))).toBe("address-blocked");
  });

  it("refuses a name when any of its addresses is internal", async () => {
    expect(await failure(read("/page", "mixed.test"))).toBe("address-blocked");
  });

  it("refuses a redirect to an internal name or address", async () => {
    expect(await failure(read("/to-internal"))).toBe("address-blocked");
    expect(await failure(read("/to-literal"))).toBe("address-blocked");
  });

  it("refuses a literal internal address and localhost", async () => {
    expect(await failure(read("/page", "10.0.0.5"))).toBe("address-blocked");
    expect(await failure(read("/page", "localhost"))).toBe("address-blocked");
  });

  it("stops after too many redirects", async () => {
    expect(await failure(read("/loop"))).toBe("too-many-redirects");
  });

  it("cuts a large page off at the cap", async () => {
    const page = await read("/huge", "careers.test", { maxBytes: 1000 });
    expect(page.text.length).toBe(1000);
  });

  it("decodes a compressed page, and caps the decoded text", async () => {
    const page = await read("/gzip", "careers.test", { maxBytes: 1000 });
    expect(page.text.startsWith("<h1>Compressed careers</h1>")).toBe(true);
    expect(page.text.length).toBe(1000);
  });

  it("gives up at the deadline even when the page keeps trickling", async () => {
    const started = Date.now();
    expect(await failure(read("/trickle", "careers.test", { timeoutMs: 400 }))).toBe("failed");
    expect(Date.now() - started).toBeLessThan(2000);
  });

  it("stops a redirect's body instead of downloading it", async () => {
    const page = await read("/streaming-redirect");
    expect(page.text).toBe("<h1>Careers</h1>");
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(redirectBodyClosed).toBe(true);
  });

  it("refuses other schemes and embedded passwords", async () => {
    expect(await failure(readPublicPage("file:///etc/passwd", options))).toBe("url-invalid");
    expect(
      await failure(readPublicPage(`http://me:pw@careers.test:${port}/page`, options)),
    ).toBe("url-invalid");
  });
});

describe("which addresses are public", () => {
  it("blocks this machine, home networks and their disguises", () => {
    for (const address of [
      "127.0.0.1",
      "10.1.2.3",
      "172.16.0.1",
      "192.168.1.168",
      "169.254.169.254",
      "100.64.0.1",
      "0.0.0.0",
      "::1",
      "::",
      "fd00::1",
      "fe80::1",
      "::ffff:127.0.0.1",
      "::ffff:7f00:1",
      "64:ff9b::7f00:1",
    ]) {
      expect(isPublicAddress(address), address).toBe(false);
    }
  });

  it("allows ordinary internet addresses", () => {
    for (const address of ["8.8.8.8", "93.184.216.34", "2606:4700::1111"]) {
      expect(isPublicAddress(address), address).toBe(true);
    }
  });

  it("screens saved addresses before any request", () => {
    expect(isReadableWebUrl("https://jobs.example.com/careers")).toBe(true);
    expect(isReadableWebUrl("http://2130706433/")).toBe(false);
    expect(isReadableWebUrl("http://[::ffff:127.0.0.1]/")).toBe(false);
    expect(isReadableWebUrl("http://localhost:3000/")).toBe(false);
    expect(isReadableWebUrl("ftp://jobs.example.com/")).toBe(false);
  });
});
