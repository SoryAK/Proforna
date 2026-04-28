import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";

/**
 * Anonymous recruiter identity.
 *
 * A long-lived `recruiter_id` cookie identifies a recruiter device so
 * saves/notes persist across IR visits without requiring an account.
 *
 * Use `getOrCreateRecruiterId(req)` to read the existing cookie value
 * (or mint a new one), then call `setRecruiterCookie(res, id)` on the
 * response so the cookie sticks.
 */

export const RECRUITER_COOKIE = "recruiter_id";
const MAX_AGE_SECONDS = 60 * 60 * 24 * 365 * 2; // 2 years

const RECRUITER_ID_PATTERN = /^[a-f0-9-]{20,40}$/i;

export function readRecruiterId(req: NextRequest): string | null {
  const v = req.cookies.get(RECRUITER_COOKIE)?.value;
  return v && RECRUITER_ID_PATTERN.test(v) ? v : null;
}

export function getOrCreateRecruiterId(req: NextRequest): string {
  return readRecruiterId(req) ?? randomUUID();
}

export function setRecruiterCookie(res: NextResponse, id: string) {
  res.cookies.set(RECRUITER_COOKIE, id, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE_SECONDS,
  });
}
