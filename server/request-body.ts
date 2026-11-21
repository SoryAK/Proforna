import type { Context, MiddlewareHandler } from "hono";

/**
 * Bad request data is the caller's mistake, so it answers 400, not a 500 that
 * looks like the server broke. The body is checked once here, before any route
 * reads it; routes then read the same body from Hono's cache. Every such
 * case answers `invalid-body`, the code the routes themselves use.
 */

const BODY_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const emptyBodies = new WeakSet<Request>();

export function checkRequestBody(): MiddlewareHandler {
  return async (c, next) => {
    if (!BODY_METHODS.has(c.req.method)) return next();
    const type = (c.req.header("content-type") ?? "").toLowerCase();
    if (
      type.startsWith("multipart/form-data") ||
      type.startsWith("application/x-www-form-urlencoded")
    ) {
      try {
        await c.req.formData();
      } catch {
        return c.json({ error: "invalid-body" }, 400);
      }
      return next();
    }
    let text: string;
    try {
      text = await c.req.text();
    } catch {
      return c.json({ error: "invalid-body" }, 400);
    }
    if (!text.trim()) {
      // Many actions need no body. If a route does want JSON, onError turns
      // its parse failure into a 400 through isMissingJsonBody.
      emptyBodies.add(c.req.raw);
      return next();
    }
    let value: unknown;
    try {
      value = JSON.parse(text);
    } catch {
      return c.json({ error: "invalid-body" }, 400);
    }
    if (value === null || typeof value !== "object") {
      return c.json({ error: "invalid-body" }, 400);
    }
    return next();
  };
}

/** True when a route asked for JSON from a request that sent no body. */
export function isMissingJsonBody(error: unknown, c: Context): boolean {
  return error instanceof SyntaxError && emptyBodies.has(c.req.raw);
}
