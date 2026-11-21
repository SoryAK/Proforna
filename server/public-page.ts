import { lookup as dnsLookup, type LookupAddress } from "node:dns";
import http from "node:http";
import https from "node:https";
import { BlockList, isIP } from "node:net";
import type { Readable } from "node:stream";
import { createBrotliDecompress, createGunzip, createInflate } from "node:zlib";

/**
 * Reads a page from the public internet for the occupant, such as a saved
 * company careers page. It never reaches this machine or the home network:
 * every address a name resolves to is checked at the moment of connecting
 * (so a name cannot switch to an internal address between check and use),
 * redirects are followed by hand and checked hop by hop, and the body is capped.
 */

const blocked = new BlockList();
for (const [network, prefix] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
] as const) {
  blocked.addSubnet(network, prefix, "ipv4");
}
for (const [network, prefix] of [
  ["::", 128],
  ["::1", 128],
  ["64:ff9b::", 96],
  ["100::", 64],
  ["2001:db8::", 32],
  ["fc00::", 7],
  ["fe80::", 10],
  ["ff00::", 8],
] as const) {
  blocked.addSubnet(network, prefix, "ipv6");
}

/** True when an IP address is on the public internet. IPv4-mapped IPv6 is checked as IPv4. */
export function isPublicAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 4) return !blocked.check(address, "ipv4");
  if (family === 6) return !blocked.check(address, "ipv6");
  return false;
}

export type PublicPage = { status: number; contentType: string; text: string };

export type ReadPublicPageOptions = {
  /** Resolves a name to its addresses. Defaults to the system resolver. */
  resolve?: (hostname: string) => Promise<string[]>;
  /** Decides whether an address may be reached. Defaults to {@link isPublicAddress}. */
  allowAddress?: (address: string) => boolean;
  headers?: Record<string, string>;
  maxBytes?: number;
  maxRedirects?: number;
  timeoutMs?: number;
};

export class PublicPageError extends Error {
  constructor(
    readonly code:
      | "url-invalid"
      | "address-blocked"
      | "too-many-redirects"
      | "failed",
  ) {
    super(code);
  }
}

export async function readPublicPage(
  value: string,
  options: ReadPublicPageOptions = {},
): Promise<PublicPage> {
  const maxRedirects = options.maxRedirects ?? 5;
  // One deadline for the whole read, redirects included. The socket timeout
  // only catches silence, so a page trickling a byte at a time needs this.
  const deadline = Date.now() + (options.timeoutMs ?? 8000);
  let url = parseWebUrl(value);
  for (let hop = 0; ; hop += 1) {
    const response = await requestOnce(url, options, deadline);
    if (response.status >= 300 && response.status < 400 && response.location) {
      if (hop >= maxRedirects) throw new PublicPageError("too-many-redirects");
      url = parseWebUrl(new URL(response.location, url).toString());
      continue;
    }
    return {
      status: response.status,
      contentType: response.contentType,
      text: response.text,
    };
  }
}

/** True when a saved address could be read at all: http(s) and not obviously local. */
export function isReadableWebUrl(value: string): boolean {
  try {
    const url = parseWebUrl(value);
    const host = bareHost(url);
    if (host === "localhost" || host.endsWith(".localhost")) return false;
    return isIP(host) === 0 || isPublicAddress(host);
  } catch {
    return false;
  }
}

function parseWebUrl(value: string): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new PublicPageError("url-invalid");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new PublicPageError("url-invalid");
  }
  if (url.username || url.password) throw new PublicPageError("url-invalid");
  return url;
}

function bareHost(url: URL): string {
  return url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
}

/** Undoes gzip, deflate, or Brotli; `null` for a body sent as is. */
function decoderFor(encoding: string): Readable & NodeJS.WritableStream | null {
  const name = encoding.trim().toLowerCase();
  if (name === "gzip" || name === "x-gzip") return createGunzip();
  if (name === "deflate") return createInflate();
  if (name === "br") return createBrotliDecompress();
  return null;
}

function requestOnce(
  url: URL,
  options: ReadPublicPageOptions,
  deadline: number,
): Promise<{ status: number; location: string | null; contentType: string; text: string }> {
  const allow = options.allowAddress ?? isPublicAddress;
  const maxBytes = options.maxBytes ?? 1_000_000;
  const host = bareHost(url);
  // Node skips the lookup hook for literal addresses, so check those here.
  if (isIP(host) !== 0 && !allow(host)) {
    return Promise.reject(new PublicPageError("address-blocked"));
  }
  if (host === "localhost" || host.endsWith(".localhost")) {
    return Promise.reject(new PublicPageError("address-blocked"));
  }

  let blockedAddress = false;
  const lookup = (
    hostname: string,
    lookupOptions: { all?: boolean },
    callback: (
      error: NodeJS.ErrnoException | null,
      address: string | LookupAddress[],
      family?: number,
    ) => void,
  ) => {
    const done = (error: Error | null, addresses: string[]) => {
      if (error) return callback(error, "");
      if (addresses.length === 0 || !addresses.every(allow)) {
        blockedAddress = true;
        return callback(Object.assign(new Error("address-blocked"), { code: "EBLOCKED" }), "");
      }
      if (lookupOptions.all) {
        callback(
          null,
          addresses.map((address) => ({ address, family: isIP(address) })),
        );
      } else {
        callback(null, addresses[0], isIP(addresses[0]));
      }
    };
    if (options.resolve) {
      options.resolve(hostname).then(
        (addresses) => done(null, addresses),
        (error: Error) => done(error, []),
      );
    } else {
      dnsLookup(hostname, { all: true }, (error, addresses) =>
        done(error, (addresses ?? []).map((entry) => entry.address)),
      );
    }
  };

  const client = url.protocol === "https:" ? https : http;
  const remaining = deadline - Date.now();
  if (remaining <= 0) return Promise.reject(new PublicPageError("failed"));
  return new Promise((resolve, reject) => {
    let settled = false;
    const settle = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      fn();
    };
    const request = client.get(
      url,
      {
        headers: options.headers,
        lookup: lookup as never,
        timeout: options.timeoutMs ?? 8000,
      },
      (response) => {
        const status = response.statusCode ?? 0;
        const location =
          typeof response.headers.location === "string" ? response.headers.location : null;
        const contentType = String(response.headers["content-type"] ?? "");
        if (status >= 300 && status < 400) {
          // Only the Location header matters; stop the body here.
          response.destroy();
          settle(() => resolve({ status, location, contentType, text: "" }));
          return;
        }
        // A compressed page is decoded first, and the cap counts decoded bytes.
        const decoder = decoderFor(String(response.headers["content-encoding"] ?? ""));
        const body: Readable = decoder ? response.pipe(decoder) : response;
        const stop = () => {
          response.destroy();
          decoder?.destroy();
        };
        const chunks: Buffer[] = [];
        let size = 0;
        const finish = () =>
          settle(() =>
            resolve({
              status,
              location,
              contentType,
              text: Buffer.concat(chunks).toString("utf8"),
            }),
          );
        // A page past the cap is cut off there, not downloaded in full.
        body.on("data", (chunk: Buffer) => {
          const room = maxBytes - size;
          if (chunk.length >= room) {
            chunks.push(chunk.subarray(0, room));
            size = maxBytes;
            stop();
            finish();
            return;
          }
          size += chunk.length;
          chunks.push(chunk);
        });
        body.on("end", finish);
        body.on("error", () => settle(() => reject(new PublicPageError("failed"))));
        response.on("error", () => settle(() => reject(new PublicPageError("failed"))));
      },
    );
    const timer = setTimeout(() => {
      request.destroy(new Error("deadline"));
      settle(() => reject(new PublicPageError("failed")));
    }, remaining);
    request.on("timeout", () => request.destroy(new Error("timeout")));
    request.on("error", () =>
      settle(() => reject(new PublicPageError(blockedAddress ? "address-blocked" : "failed"))),
    );
  });
}
