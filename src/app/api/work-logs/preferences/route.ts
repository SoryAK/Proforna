import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserId } from "@/lib/auth-utils";

const ALLOWED_CATEGORIES = new Set([
  "task",
  "project",
  "meeting",
  "training",
  "administrative",
  "maintenance",
  "troubleshooting",
  "on-call",
  "other",
]);

const ALLOWED_MOODS = new Set(["good", "neutral", "tough"]);

function normalizeCategory(value: unknown) {
  const next = String(value ?? "task").trim().toLowerCase();
  return ALLOWED_CATEGORIES.has(next) ? next : "task";
}

function normalizeMood(value: unknown): string | null {
  if (value == null || value === "") return null;
  const next = String(value).trim().toLowerCase();
  return ALLOWED_MOODS.has(next) ? next : null;
}

function normalizeHours(value: unknown): number | null {
  if (value == null || value === "") return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return parsed;
}

function emptyPreferences() {
  return {
    defaultPositionId: null,
    defaultShiftId: null,
    defaultCategory: "task",
    defaultMood: null,
    defaultHours: null,
  };
}

export async function GET() {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const pref = await prisma.workLogPreference.findUnique({
    where: { userId },
    include: {
      defaultShift: {
        select: { id: true, workHistoryId: true, isActive: true },
      },
    },
  });

  if (!pref) return NextResponse.json(emptyPreferences());

  const defaultPositionId = pref.defaultPositionId ?? null;
  let defaultShiftId = pref.defaultShiftId ?? null;

  if (
    defaultShiftId &&
    (!pref.defaultShift ||
      !pref.defaultShift.isActive ||
      (defaultPositionId && pref.defaultShift.workHistoryId !== defaultPositionId))
  ) {
    defaultShiftId = null;
  }

  return NextResponse.json({
    defaultPositionId,
    defaultShiftId,
    defaultCategory: normalizeCategory(pref.defaultCategory),
    defaultMood: normalizeMood(pref.defaultMood),
    defaultHours: normalizeHours(pref.defaultHours),
  });
}

export async function PUT(request: Request) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await request.json()) as Record<string, unknown>;

  const defaultCategory = normalizeCategory(body.defaultCategory);
  const defaultMood = normalizeMood(body.defaultMood);
  const defaultHours = normalizeHours(body.defaultHours);

  const requestedPositionId = body.defaultPositionId ? String(body.defaultPositionId) : null;
  const requestedShiftId = body.defaultShiftId ? String(body.defaultShiftId) : null;

  let defaultPositionId: string | null = null;
  if (requestedPositionId) {
    const position = await prisma.workHistory.findFirst({
      where: { id: requestedPositionId, userId },
      select: { id: true },
    });
    if (!position) {
      return NextResponse.json({ error: "Default company not found" }, { status: 404 });
    }
    defaultPositionId = position.id;
  }

  let defaultShiftId: string | null = null;
  if (requestedShiftId) {
    const shift = await prisma.workHistoryShift.findFirst({
      where: { id: requestedShiftId, userId, isActive: true },
      select: { id: true, workHistoryId: true },
    });
    if (!shift) {
      return NextResponse.json({ error: "Default shift not found" }, { status: 404 });
    }
    if (defaultPositionId && shift.workHistoryId !== defaultPositionId) {
      return NextResponse.json({ error: "Default shift must belong to default company" }, { status: 400 });
    }
    if (!defaultPositionId) {
      defaultPositionId = shift.workHistoryId;
    }
    defaultShiftId = shift.id;
  }

  const saved = await prisma.workLogPreference.upsert({
    where: { userId },
    create: {
      userId,
      defaultPositionId,
      defaultShiftId,
      defaultCategory,
      defaultMood,
      defaultHours,
    },
    update: {
      defaultPositionId,
      defaultShiftId,
      defaultCategory,
      defaultMood,
      defaultHours,
    },
    select: {
      defaultPositionId: true,
      defaultShiftId: true,
      defaultCategory: true,
      defaultMood: true,
      defaultHours: true,
    },
  });

  return NextResponse.json({
    defaultPositionId: saved.defaultPositionId,
    defaultShiftId: saved.defaultShiftId,
    defaultCategory: normalizeCategory(saved.defaultCategory),
    defaultMood: normalizeMood(saved.defaultMood),
    defaultHours: normalizeHours(saved.defaultHours),
  });
}
