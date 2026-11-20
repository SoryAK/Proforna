import type { MiddlewareHandler } from "hono";
import { bodyLimit } from "hono/body-limit";
import { PROFILE_AVATAR_MAX_BYTES } from "../core/profile";
import { UPLOAD_MAX_BYTES } from "./documents";
import { MAX_RESTORE_ARCHIVE_BYTES } from "./portability";

export { UPLOAD_MAX_BYTES };

/** Ordinary JSON requests: forms, edits, chat. */
export const DEFAULT_BODY_MAX_BYTES = 2 * 1024 * 1024;

/** Room for the multipart wrapping and form fields around an uploaded file. */
const FORM_OVERHEAD = 1024 * 1024;

const uploadRoutes: Array<{ path: RegExp; maxSize: number }> = [
  { path: /^\/api\/portability\/restore$/, maxSize: MAX_RESTORE_ARCHIVE_BYTES },
  { path: /^\/api\/documents$/, maxSize: UPLOAD_MAX_BYTES + FORM_OVERHEAD },
  { path: /^\/api\/resumes(\/extract)?$/, maxSize: UPLOAD_MAX_BYTES + FORM_OVERHEAD },
  { path: /^\/api\/profile\/avatar$/, maxSize: PROFILE_AVATAR_MAX_BYTES + FORM_OVERHEAD },
  {
    path: /^\/api\/work-map\/roles\/[^/]+\/photos$/,
    maxSize: PROFILE_AVATAR_MAX_BYTES + FORM_OVERHEAD,
  },
];

export function bodyLimitFor(path: string): number {
  return (
    uploadRoutes.find((route) => route.path.test(path))?.maxSize ??
    DEFAULT_BODY_MAX_BYTES
  );
}

/**
 * Caps every request body as it arrives, so an oversized upload is turned away
 * before it is held in memory. Uploads get their own larger caps.
 */
export function requestBodyLimits(): MiddlewareHandler {
  const limiters = new Map<number, MiddlewareHandler>();
  const limiterFor = (maxSize: number) => {
    let limiter = limiters.get(maxSize);
    if (!limiter) {
      limiter = bodyLimit({
        maxSize,
        onError: (c) => c.json({ error: "too-large" }, 413),
      });
      limiters.set(maxSize, limiter);
    }
    return limiter;
  };
  return (c, next) => limiterFor(bodyLimitFor(c.req.path))(c, next);
}
