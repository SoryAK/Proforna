import { describe, expect, it } from "vitest";
import { isPublicAddress, readLinkedPage } from "./linked-page";

describe("reading a linked page", () => {
  it("keeps the title, social tags, and readable text", () => {
    const page = readLinkedPage(`<!doctype html>
      <html><head>
        <title>Fold review &amp; verdict</title>
        <meta property="og:title" content="The crease is &quot;gone&quot;">
        <meta content="Reviews Weekly" property="og:site_name" />
        <meta name="description" content="Hands on.">
        <style>.x { color: red }</style>
        <script>window.track = "SECRET_SCRIPT";</script>
      </head><body>
        <h1>The crease</h1>
        <p>You cannot   feel the fold anymore.</p>
        <noscript>SECRET_NOSCRIPT</noscript>
      </body></html>`);
    expect(page.title).toBe("Fold review & verdict");
    expect(page.meta).toEqual({
      "og:title": 'The crease is "gone"',
      "og:site_name": "Reviews Weekly",
      description: "Hands on.",
    });
    expect(page.text).toContain("The crease You cannot feel the fold anymore.");
    expect(page.text).not.toContain("SECRET_");
    expect(page.text).not.toContain("color");
  });

  it("caps the stored text", () => {
    const page = readLinkedPage(`<p>${"word ".repeat(100_000)}</p>`);
    expect(page.text.length).toBeLessThanOrEqual(100_000);
  });
});

describe("public addresses", () => {
  it("allows addresses on the public internet", () => {
    for (const address of ["93.184.216.34", "2606:2800:220:1:248:1893:25c8:1946"]) {
      expect(isPublicAddress(address)).toBe(true);
    }
  });

  it("refuses this machine, the local network, and reserved ranges", () => {
    for (const address of [
      "127.0.0.1",
      "10.0.0.5",
      "172.16.4.2",
      "192.168.1.1",
      "169.254.169.254",
      "100.64.0.1",
      "0.0.0.0",
      "224.0.0.1",
      "::1",
      "::",
      "fe80::1",
      "fd00::1",
      "::ffff:127.0.0.1",
      "::ffff:7f00:1",
      "not-an-address",
    ]) {
      expect(isPublicAddress(address)).toBe(false);
    }
  });
});
