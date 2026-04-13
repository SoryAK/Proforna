/**
 * Bi-directional sync between CurrentPosition and WorkHistory.
 *
 * The two models store overlapping info with different field names/types.
 * When one side is updated, we push changed overlapping fields to the other.
 * Matching is by userId + case-insensitive company name.
 */

import { prisma } from "@/lib/prisma";

// ── Field mapping: WorkHistory field → CurrentPosition field + converters ──

type WHKey = string;
type CPKey = string;

interface FieldMap {
  wh: WHKey;
  cp: CPKey;
  /** Convert WorkHistory value → CurrentPosition value */
  toCP: (v: unknown) => unknown;
  /** Convert CurrentPosition value → WorkHistory value */
  toWH: (v: unknown) => unknown;
}

const FIELD_MAPS: FieldMap[] = [
  // Title / Role
  {
    wh: "title",
    cp: "role",
    toCP: (v) => (v != null ? String(v) : undefined), // don't null out CP role (it's required)
    toWH: (v) => (v != null ? String(v) : null),
  },
  // Salary  (WH: Float salaryAmount  |  CP: Int salary)
  {
    wh: "salaryAmount",
    cp: "salary",
    toCP: (v) => (v != null ? Math.round(Number(v)) : null),
    toWH: (v) => (v != null ? Number(v) : null),
  },
  // Salary type  (WH: "annual"|"hourly"  |  CP: payType "salary"|"hourly")
  {
    wh: "salaryType",
    cp: "payType",
    toCP: (v) => {
      if (v === "hourly") return "hourly";
      if (v === "annual") return "salary";
      return undefined; // don't sync unknown values
    },
    toWH: (v) => {
      if (v === "hourly") return "hourly";
      if (v === "salary") return "annual";
      return null;
    },
  },
  // Currency
  {
    wh: "salaryCurrency",
    cp: "currency",
    toCP: (v) => (v != null ? String(v) : undefined),
    toWH: (v) => (v != null ? String(v) : null),
  },
  // Work mode  (WH: workMode "on-site"|"hybrid"|"remote"  |  CP: type "remote"|"hybrid"|"onsite")
  {
    wh: "workMode",
    cp: "type",
    toCP: (v) => {
      if (v === "on-site") return "onsite";
      if (v === "hybrid") return "hybrid";
      if (v === "remote") return "remote";
      return undefined;
    },
    toWH: (v) => {
      if (v === "onsite") return "on-site";
      if (v === "hybrid") return "hybrid";
      if (v === "remote") return "remote";
      return null;
    },
  },
  // Schedule type  (WH: scheduleType "full-time"|"part-time"|...  |  CP: schedule)
  {
    wh: "scheduleType",
    cp: "schedule",
    toCP: (v) => (v != null ? String(v) : null),
    toWH: (v) => (v != null ? String(v) : null),
  },
  // Hours/week  (both Float? hoursPerWeek)
  {
    wh: "hoursPerWeek",
    cp: "hoursPerWeek",
    toCP: (v) => (v != null ? Number(v) : null),
    toWH: (v) => (v != null ? Number(v) : null),
  },
  // Department
  {
    wh: "department",
    cp: "department",
    toCP: (v) => (v != null ? String(v) : null),
    toWH: (v) => (v != null ? String(v) : null),
  },
  // Manager name
  {
    wh: "managerName",
    cp: "managerName",
    toCP: (v) => (v != null ? String(v) : null),
    toWH: (v) => (v != null ? String(v) : null),
  },
];

/**
 * After a WorkHistory is created/updated, sync overlapping fields
 * to the matching CurrentPosition (if one exists).
 *
 * @param userId  owner
 * @param company company name from the WorkHistory record
 * @param changedFields  the fields that were just written (keys are WH field names)
 */
export async function syncWorkHistoryToPosition(
  userId: string,
  company: string,
  changedFields: Record<string, unknown>,
) {
  try {
    const match = await prisma.currentPosition.findFirst({
      where: {
        userId,
        company: { equals: company, mode: "insensitive" },
      },
    });
    if (!match) return; // no linked position — nothing to sync

    const update: Record<string, unknown> = {};
    for (const map of FIELD_MAPS) {
      if (!(map.wh in changedFields)) continue; // field wasn't changed
      const converted = map.toCP(changedFields[map.wh]);
      if (converted === undefined) continue; // converter says skip
      update[map.cp] = converted;
    }

    if (Object.keys(update).length === 0) return;
    await prisma.currentPosition.update({ where: { id: match.id }, data: update });
  } catch (e) {
    // Sync is best-effort — never break the primary save
    console.error("[position-sync] WH→CP error:", e);
  }
}

/**
 * After a CurrentPosition is created/updated, sync overlapping fields
 * to all matching WorkHistory records (by company name).
 *
 * @param userId  owner
 * @param company company name from the CurrentPosition record
 * @param changedFields  the fields that were just written (keys are CP field names)
 */
export async function syncPositionToWorkHistory(
  userId: string,
  company: string,
  changedFields: Record<string, unknown>,
) {
  try {
    const matches = await prisma.workHistory.findMany({
      where: {
        userId,
        company: { equals: company, mode: "insensitive" },
      },
      select: { id: true },
    });
    if (matches.length === 0) return;

    const update: Record<string, unknown> = {};
    for (const map of FIELD_MAPS) {
      if (!(map.cp in changedFields)) continue;
      const converted = map.toWH(changedFields[map.cp]);
      if (converted === undefined) continue;
      update[map.wh] = converted;
    }

    if (Object.keys(update).length === 0) return;
    await Promise.all(
      matches.map((wh) =>
        prisma.workHistory.update({ where: { id: wh.id }, data: update }),
      ),
    );
  } catch (e) {
    console.error("[position-sync] CP→WH error:", e);
  }
}
