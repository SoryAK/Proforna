import { lookup as dnsLookup, type LookupAddress } from "node:dns";
import http from "node:http";
import https from "node:https";
import { isIP, type LookupFunction } from "node:net";
import { isFrameTarget, isLinkedEvidenceUrl, isPublicAddress, type FrameHeaderSet } from "../core/index";

export type FetchedPage = { url: string; contentType: string; html: string };

export type PageFetch = (url: string) => Promise<FetchedPage>;

export type FrameHeaderFetch = (url: string) => Promise<FrameHeaderSet>;

const MAX_BYTES = 3_000_000;
const MAX_REDIRECTS = 5;
const TIMEOUT_MS = 10_000;

export class PageCaptureError extends Error {
  constructor(readonly code: "page-blocked" | "page-unreachable") {
    super(code);
  }
}

export const fetchPublicPage: PageFetch = async (url) => {
  let current = url;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    const response = await requestOnce(current);
    if (response.location) {
      current = new URL(response.location, current).toString();
      continue;
    }
    return { url: current, contentType: response.contentType, html: response.body };
  }
  throw new PageCaptureError("page-unreachable");
};

const guardedLookup: LookupFunction = (hostname, options, callback) => {
  dnsLookup(hostname, { ...options, all: true }, (error, found) => {
    if (error) {
      callback(error, "", 0);
      return;
    }
    const addresses = found as LookupAddress[];
    if (
      addresses.length === 0 ||
      addresses.some((entry) => !isPublicAddress(entry.address))
    ) {
      callback(new PageCaptureError("page-blocked"), "", 0);
      return;
    }
    if (options.all) {
      (callback as unknown as (e: null, a: LookupAddress[]) => void)(null, addresses);
    } else {
      callback(null, addresses[0].address, addresses[0].family);
    }
  });
};

function requestOnce(url: string): Promise<{
  location: string | null;
  contentType: string;
  body: string;
}> {
  if (!isLinkedEvidenceUrl(url)) return Promise.reject(new PageCaptureError("page-blocked"));
  const target = new URL(url);
  const host = target.hostname.replace(/^\[|\]$/g, "");
  if (isIP(host) && !isPublicAddress(host)) {
    return Promise.reject(new PageCaptureError("page-blocked"));
  }
  const client = target.protocol === "https:" ? https : http;
  return new Promise((resolve, reject) => {
    const request = client.get(
      target,
      {
        lookup: guardedLookup,
        timeout: TIMEOUT_MS,
        headers: {
          "user-agent": "Proforna linked evidence capture",
          accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.5",
        },
      },
      (response) => {
        const status = response.statusCode ?? 0;
        const location = response.headers.location;
        if (status >= 300 && status < 400 && location) {
          response.resume();
          resolve({ location, contentType: "", body: "" });
          return;
        }
        if (status < 200 || status >= 300) {
          response.resume();
          reject(new PageCaptureError("page-unreachable"));
          return;
        }
        const contentType = String(response.headers["content-type"] ?? "");
        if (!/html|xml/i.test(contentType)) {
          response.resume();
          resolve({ location: null, contentType, body: "" });
          return;
        }
        const chunks: Buffer[] = [];
        let size = 0;
        response.on("data", (chunk: Buffer) => {
          size += chunk.length;
          if (size > MAX_BYTES) {
            response.destroy();
            return;
          }
          chunks.push(chunk);
        });
        const finish = () =>
          resolve({
            location: null,
            contentType,
            body: Buffer.concat(chunks).toString("utf8"),
          });
        response.on("end", finish);
        response.on("close", finish);
        response.on("error", () => reject(new PageCaptureError("page-unreachable")));
      },
    );
    request.on("timeout", () => request.destroy(new PageCaptureError("page-unreachable")));
    request.on("error", (error) =>
      reject(error instanceof PageCaptureError ? error : new PageCaptureError("page-unreachable")),
    );
  });
}

export const fetchPublicFrameHeaders: FrameHeaderFetch = async (url) => {
  let current = url;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    let response = await requestHeaders(current, "HEAD");
    if (response.status === 403 || response.status === 405 || response.status === 501) {
      response = await requestHeaders(current, "GET");
    }
    if (response.location) {
      current = new URL(response.location, current).toString();
      continue;
    }
    if (response.status < 200 || response.status >= 300) {
      throw new PageCaptureError("page-unreachable");
    }
    return {
      frameOptions: response.frameOptions,
      contentSecurityPolicy: response.contentSecurityPolicy,
    };
  }
  throw new PageCaptureError("page-unreachable");
};

function requestHeaders(
  url: string,
  method: "GET" | "HEAD",
): Promise<{
  status: number;
  location: string | null;
  frameOptions: string | null;
  contentSecurityPolicy: string | string[] | null;
}> {
  if (!isFrameTarget(url)) return Promise.reject(new PageCaptureError("page-blocked"));
  const target = new URL(url);
  const host = target.hostname.replace(/^\[|\]$/g, "");
  if (isIP(host) && !isPublicAddress(host)) {
    return Promise.reject(new PageCaptureError("page-blocked"));
  }
  const client = target.protocol === "https:" ? https : http;
  return new Promise((resolve, reject) => {
    const request = client.request(
      target,
      {
        method,
        lookup: guardedLookup,
        timeout: TIMEOUT_MS,
        headers: {
          "user-agent": "Proforna linked evidence capture",
          accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.5",
        },
      },
      (response) => {
        response.resume();
        const status = response.statusCode ?? 0;
        const location = response.headers.location;
        resolve({
          status,
          location: status >= 300 && status < 400 && location ? String(location) : null,
          frameOptions: oneHeader(response.headers["x-frame-options"]),
          contentSecurityPolicy: headerList(response.headers["content-security-policy"]),
        });
      },
    );
    request.on("timeout", () => request.destroy(new PageCaptureError("page-unreachable")));
    request.on("error", (error) =>
      reject(error instanceof PageCaptureError ? error : new PageCaptureError("page-unreachable")),
    );
    request.end();
  });
}

function oneHeader(value: string | string[] | undefined): string | null {
  if (!value) return null;
  return Array.isArray(value) ? value.join(", ") : value;
}

function headerList(value: string | string[] | undefined): string | string[] | null {
  if (!value || (Array.isArray(value) && value.length === 0)) return null;
  return value;
}
