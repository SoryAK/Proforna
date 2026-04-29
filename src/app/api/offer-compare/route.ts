import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserId } from "@/lib/auth-utils";
import { checkRateLimit } from "@/lib/rate-limit";

/**
 * POST /api/offer-compare
 *
 * Body: {
 *   base?: number, bonus?: number, equity?: number, signOn?: number,
 *   period?: "annual"|"hourly"|"monthly",
 *   currency?: string,
 *   employmentType?: string,
 *   workMode?: "remote"|"hybrid"|"onsite",
 *   benefits?: string[],
 *   notes?: string,
 * }
 *
 * Returns a verdict object scoring the offer against the user's CompensationPreference.
 * Pure read on the user's stored prefs + arithmetic; nothing is persisted.
 */
export async function POST(req: Request) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rl = checkRateLimit(`offer:compare:${userId}`, { limit: 60, windowMs: 60 * 60 * 1000 });
  if (!rl.ok) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429, headers: rl.headers });
  }

  let body: Record<string, unknown>;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const profile = await prisma.userProfile.findUnique({ where: { userId } });
  if (!profile) return NextResponse.json({ error: "Profile not found" }, { status: 404 });

  const prefs = await prisma.compensationPreference.findUnique({ where: { profileId: profile.id } });
  if (!prefs) {
    return NextResponse.json({
      hasPrefs: false,
      message: "Set your compensation expectations on the portal settings page first.",
    });
  }

  const num = (v: unknown) => {
    if (v == null || v === "") return null;
    const n = typeof v === "number" ? v : parseFloat(String(v));
    return Number.isFinite(n) && n >= 0 ? n : null;
  };

  const base = num(body.base);
  const bonus = num(body.bonus) ?? 0;
  const equity = num(body.equity) ?? 0;
  const signOn = num(body.signOn) ?? 0;

  if (base == null) {
    return NextResponse.json({ error: "Missing base salary" }, { status: 400 });
  }

  // Total comp (sign-on amortized over 1 year is intentional — recruiters pitch it that way).
  const totalAnnual = base + bonus + equity + signOn;

  // Compare against stored prefs (annual only for v1).
  const issues: string[] = [];
  const wins: string[] = [];

  if (prefs.salaryMin != null && base < prefs.salaryMin) {
    issues.push(`Base $${base.toLocaleString()} is below your stated minimum $${prefs.salaryMin.toLocaleString()}.`);
  } else if (prefs.salaryMin != null) {
    wins.push(`Base meets your minimum of $${prefs.salaryMin.toLocaleString()}.`);
  }

  if (prefs.hardFloor != null && base < prefs.hardFloor) {
    issues.push("Base is below your private hard floor.");
  }

  if (prefs.salaryTarget != null) {
    const delta = base - prefs.salaryTarget;
    if (delta >= 0) wins.push(`Base is $${delta.toLocaleString()} above your target.`);
    else issues.push(`Base is $${Math.abs(delta).toLocaleString()} short of your target.`);
  }

  if (prefs.salaryMax != null && totalAnnual >= prefs.salaryMax) {
    wins.push(`Total package $${totalAnnual.toLocaleString()} hits or exceeds your stated max.`);
  }

  // Work mode mismatch
  const offerMode = typeof body.workMode === "string" ? body.workMode : null;
  if (offerMode && prefs.remotePreference !== "any" && offerMode !== prefs.remotePreference) {
    issues.push(`Offer is ${offerMode}; you prefer ${prefs.remotePreference}.`);
  } else if (offerMode && prefs.remotePreference !== "any") {
    wins.push(`Work mode (${offerMode}) matches your preference.`);
  }

  // Open-to flags
  if (equity > 0 && !prefs.openToEquity) {
    issues.push("Offer includes equity but you have not flagged yourself open to it.");
  }
  if (signOn > 0 && !prefs.openToSignOn) {
    issues.push("Offer includes a sign-on but you have not flagged yourself open to it.");
  }
  if (bonus > 0 && !prefs.openToBonus) {
    issues.push("Offer includes a bonus but you have not flagged yourself open to bonus comp.");
  }

  // Benefit must-haves: client sends an array of which they verified the offer includes.
  const offerBenefits = Array.isArray(body.benefits)
    ? (body.benefits as unknown[]).filter((b): b is string => typeof b === "string")
    : [];
  let mustHaves: string[] = [];
  try {
    mustHaves = prefs.benefitsMustHaves ? JSON.parse(prefs.benefitsMustHaves) : [];
  } catch { /* ignore */ }
  const missing = mustHaves.filter((m) => !offerBenefits.includes(m));
  if (missing.length > 0) {
    issues.push(`Missing must-have benefits: ${missing.join(", ")}.`);
  } else if (mustHaves.length > 0) {
    wins.push("All your benefit must-haves are covered.");
  }

  // Verdict heuristic
  let verdict: "strong" | "good" | "borderline" | "weak";
  if (issues.length === 0 && wins.length >= 2) verdict = "strong";
  else if (issues.length === 0) verdict = "good";
  else if (issues.length <= 1) verdict = "borderline";
  else verdict = "weak";

  return NextResponse.json({
    hasPrefs: true,
    verdict,
    base,
    bonus,
    equity,
    signOn,
    totalAnnual,
    deltaToTarget: prefs.salaryTarget != null ? base - prefs.salaryTarget : null,
    deltaToMin: prefs.salaryMin != null ? base - prefs.salaryMin : null,
    issues,
    wins,
    prefsSnapshot: {
      currency: prefs.currency,
      period: prefs.period,
      salaryMin: prefs.salaryMin,
      salaryTarget: prefs.salaryTarget,
      salaryMax: prefs.salaryMax,
      hasHardFloor: prefs.hardFloor != null,
    },
  });
}
