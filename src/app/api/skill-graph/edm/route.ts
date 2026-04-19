import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { getUserId } from "@/lib/auth-utils";
import {
  type EDMZone,
  type EDMCategory,
  type EDMExposureType,
  type ExposureDescriptor,
  ZONE_BASE_INTENSITY,
  tenureFactor,
  effectiveIntensity,
  accumulatedIntensity,
  zoneToNodeType,
} from "@/lib/edm";

function normKey(s: string): string {
  return s.trim().toLowerCase();
}

/**
 * POST /api/skill-graph/edm/generate
 *
 * Reads all WorkHistory + CurrentPosition data and creates DiffusionExposure
 * records — the Experience Diffusion Model splat for each role.
 *
 * For each work-history entry it classifies structured data into zones:
 *   CORE  — skillsUsed, equipment directly assigned
 *   NEAR  — skillsGained, major (education), adjacent processes
 *   MID   — department context, team interactions, milestones
 *   FAR   — industry, company-size context, compliance ambient
 *
 * Returns counts + the accumulated field.
 */
export async function POST() {
  const userId = await getUserId();
  if (!userId)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // ── 1. Gather all sources ─────────────────────────────────────
  const [workHistories, positions, existingNodes] = await Promise.all([
    prisma.workHistory.findMany({
      where: { userId },
      select: {
        id: true,
        type: true,
        title: true,
        company: true,
        department: true,
        companySize: true,
        skillsUsed: true,
        skillsGained: true,
        major: true,
        startDate: true,
        endDate: true,
        benefits: true,
        workMode: true,
        scheduleType: true,
        accomplishments: true,
        milestones: { select: { title: true, type: true } },
      },
    }),
    prisma.workHistory.findMany({
      where: { userId },
      select: {
        id: true,
        title: true,
        company: true,
        department: true,
        industry: true,
        techStack: true,
        startDate: true,
        endDate: true,
        equipment: { select: { id: true, name: true, category: true } },
      },
    }),
    prisma.skillNode.findMany({
      where: { userId },
      select: { id: true, name: true, type: true },
    }),
  ]);

  // Build lookup: normName → existing node
  const nodeByNorm = new Map<string, { id: string; name: string; type: string }>();
  for (const n of existingNodes) nodeByNorm.set(normKey(n.name), n);

  // Track all exposure descriptors per workHistory id
  const exposuresBySource = new Map<
    string,
    { startDate: string | null; endDate: string | null; exposures: ExposureDescriptor[] }
  >();

  // ── 2. Process WorkHistory entries ────────────────────────────
  for (const wh of workHistories) {
    const exposures: ExposureDescriptor[] = [];

    // --- CORE zone: skillsUsed (direct hands-on) ---
    if (wh.skillsUsed) {
      try {
        const arr: string[] = JSON.parse(wh.skillsUsed);
        for (const s of arr) {
          if (typeof s === "string" && s.trim()) {
            exposures.push({
              name: s.trim(),
              normName: normKey(s),
              zone: "CORE",
              category: "skill",
              exposureType: "direct",
              intensity: ZONE_BASE_INTENSITY.CORE,
            });
          }
        }
      } catch { /* bad JSON */ }
    }

    // --- NEAR zone: skillsGained (learned/observed) ---
    if (wh.skillsGained) {
      try {
        const arr: string[] = JSON.parse(wh.skillsGained);
        for (const s of arr) {
          if (typeof s === "string" && s.trim()) {
            exposures.push({
              name: s.trim(),
              normName: normKey(s),
              zone: "NEAR",
              category: "skill",
              exposureType: "observed",
              intensity: ZONE_BASE_INTENSITY.NEAR,
            });
          }
        }
      } catch { /* bad JSON */ }
    }

    // --- NEAR zone: education major → domain concept ---
    if (wh.type === "school" && wh.major) {
      exposures.push({
        name: wh.major,
        normName: normKey(wh.major),
        zone: "NEAR",
        category: "domain_concept",
        exposureType: "direct",
        intensity: ZONE_BASE_INTENSITY.NEAR,
      });
    }

    // --- MID zone: department → domain concept ---
    if (wh.department) {
      exposures.push({
        name: wh.department,
        normName: normKey(wh.department),
        zone: "MID",
        category: "domain_concept",
        exposureType: "collaborated",
        intensity: ZONE_BASE_INTENSITY.MID,
      });
    }

    // --- MID zone: milestones → process/skill exposure ---
    for (const m of wh.milestones) {
      exposures.push({
        name: m.title,
        normName: normKey(m.title),
        zone: "MID",
        category: m.type === "certification" ? "skill" : "process",
        exposureType: "direct",
        intensity: ZONE_BASE_INTENSITY.MID,
      });
    }

    // --- MID zone: accomplishments → process ---
    if (wh.accomplishments) {
      try {
        const arr: string[] = JSON.parse(wh.accomplishments);
        for (const a of arr) {
          if (typeof a === "string" && a.trim()) {
            exposures.push({
              name: a.trim(),
              normName: normKey(a),
              zone: "MID",
              category: "process",
              exposureType: "direct",
              intensity: ZONE_BASE_INTENSITY.MID,
            });
          }
        }
      } catch { /* bad JSON */ }
    }

    // --- FAR zone: company size → industry context ---
    if (wh.companySize) {
      const label = `${wh.companySize} company operations`;
      exposures.push({
        name: label,
        normName: normKey(label),
        zone: "FAR",
        category: "industry",
        exposureType: "ambient",
        intensity: ZONE_BASE_INTENSITY.FAR,
      });
    }

    // --- FAR zone: work mode → process ---
    if (wh.workMode) {
      const label = `${wh.workMode} work environment`;
      exposures.push({
        name: label,
        normName: normKey(label),
        zone: "FAR",
        category: "process",
        exposureType: "ambient",
        intensity: ZONE_BASE_INTENSITY.FAR,
      });
    }

    // --- FAR zone: schedule type → process ---
    if (wh.scheduleType) {
      const label = `${wh.scheduleType} schedule`;
      exposures.push({
        name: label,
        normName: normKey(label),
        zone: "FAR",
        category: "process",
        exposureType: "ambient",
        intensity: ZONE_BASE_INTENSITY.FAR,
      });
    }

    exposuresBySource.set(wh.id, {
      startDate: wh.startDate,
      endDate: wh.endDate,
      exposures,
    });
  }

  // ── 3. Process WorkHistory position entries ────────────────────────
  for (const pos of positions) {
    const exposures: ExposureDescriptor[] = [];

    // --- CORE: techStack (direct daily tools) ---
    if (pos.techStack) {
      try {
        const arr: string[] = JSON.parse(pos.techStack);
        for (const s of arr) {
          if (typeof s === "string" && s.trim()) {
            exposures.push({
              name: s.trim(),
              normName: normKey(s),
              zone: "CORE",
              category: "skill",
              exposureType: "direct",
              intensity: ZONE_BASE_INTENSITY.CORE,
            });
          }
        }
      } catch { /* bad JSON */ }
    }

    // --- CORE: equipment → tool/equipment ---
    for (const eq of pos.equipment) {
      exposures.push({
        name: eq.name,
        normName: normKey(eq.name),
        zone: "CORE",
        category: "equipment",
        exposureType: "direct",
        intensity: ZONE_BASE_INTENSITY.CORE,
      });
    }

    // --- MID: department → domain concept ---
    if (pos.department) {
      exposures.push({
        name: pos.department,
        normName: normKey(pos.department),
        zone: "MID",
        category: "domain_concept",
        exposureType: "collaborated",
        intensity: ZONE_BASE_INTENSITY.MID,
      });
    }

    // --- FAR: industry → industry concept ---
    if (pos.industry) {
      exposures.push({
        name: pos.industry,
        normName: normKey(pos.industry),
        zone: "FAR",
        category: "industry",
        exposureType: "ambient",
        intensity: ZONE_BASE_INTENSITY.FAR,
      });
    }

    // WorkHistory position → use as a work-history-like source
    // We need a workHistoryId — find matching WH by company+title
    // If not found, we'll skip DiffusionExposure (no WH link) but still create nodes
    const matchingWh = workHistories.find(
      (wh) =>
        wh.company === pos.company &&
        wh.title &&
        pos.title &&
        normKey(wh.title) === normKey(pos.title)
    );

    if (matchingWh) {
      const existing = exposuresBySource.get(matchingWh.id);
      if (existing) {
        // Merge — avoid duplicates by normName
        const existingNorms = new Set(existing.exposures.map((e) => e.normName));
        for (const exp of exposures) {
          if (!existingNorms.has(exp.normName)) {
            existing.exposures.push(exp);
            existingNorms.add(exp.normName);
          }
        }
      }
    }
    // If no matching WH, these exposures won't have DiffusionExposure records
    // but the nodes will still exist from sync-profile
  }

  // ── 4. Ensure all exposure target nodes exist ─────────────────
  // Collect unique nodes to upsert
  const allExposures = Array.from(exposuresBySource.values()).flatMap((s) => s.exposures);
  const uniqueByNorm = new Map<string, ExposureDescriptor>();
  for (const e of allExposures) {
    if (!uniqueByNorm.has(e.normName)) uniqueByNorm.set(e.normName, e);
  }

  let nodesCreated = 0;
  const nodeIdByNorm = new Map<string, string>();

  // Copy existing node IDs
  for (const [norm, node] of nodeByNorm) nodeIdByNorm.set(norm, node.id);

  // Create missing nodes
  for (const [norm, desc] of uniqueByNorm) {
    if (nodeIdByNorm.has(norm)) continue;

    const nodeType = zoneToNodeType(desc.category);
    const node = await prisma.skillNode.create({
      data: {
        userId,
        name: desc.name,
        type: nodeType,
        source: "edm",
      },
    });
    nodeIdByNorm.set(norm, node.id);
    nodesCreated++;
  }

  // ── 5. Create DiffusionExposure records ───────────────────────
  let exposuresCreated = 0;
  let exposuresExisted = 0;

  for (const [whId, source] of exposuresBySource) {
    const tenure = tenureFactor(source.startDate, source.endDate);

    for (const exp of source.exposures) {
      const skillNodeId = nodeIdByNorm.get(exp.normName);
      if (!skillNodeId) continue;

      const effIntensity = effectiveIntensity(exp.zone as EDMZone, tenure);

      try {
        await prisma.diffusionExposure.upsert({
          where: {
            workHistoryId_skillNodeId: {
              workHistoryId: whId,
              skillNodeId,
            },
          },
          update: {
            zone: exp.zone,
            intensity: effIntensity,
            category: exp.category,
            exposureType: exp.exposureType,
          },
          create: {
            userId,
            workHistoryId: whId,
            skillNodeId,
            zone: exp.zone,
            intensity: effIntensity,
            category: exp.category,
            exposureType: exp.exposureType,
          },
        });
        exposuresCreated++;
      } catch {
        exposuresExisted++;
      }
    }
  }

  // ── 6. Compute accumulated field ──────────────────────────────
  // For each node, gather all DiffusionExposure intensities and compute accumulated
  const allDbExposures = await prisma.diffusionExposure.findMany({
    where: { userId },
    select: {
      skillNodeId: true,
      intensity: true,
      zone: true,
      category: true,
      workHistoryId: true,
    },
  });

  // Group by skillNodeId
  const exposuresByNode = new Map<string, typeof allDbExposures>();
  for (const exp of allDbExposures) {
    const list = exposuresByNode.get(exp.skillNodeId) ?? [];
    list.push(exp);
    exposuresByNode.set(exp.skillNodeId, list);
  }

  // Build the accumulated field
  const accumulatedField: {
    nodeId: string;
    nodeName: string;
    accumulatedIntensity: number;
    sourceCount: number;
    zones: string[];
    categories: string[];
    transferable: boolean;
  }[] = [];

  // Build a reverse lookup from nodeId → name
  const nodeNameById = new Map<string, string>();
  for (const [norm, id] of nodeIdByNorm) {
    const desc = uniqueByNorm.get(norm);
    if (desc) nodeNameById.set(id, desc.name);
  }
  for (const n of existingNodes) nodeNameById.set(n.id, n.name);

  for (const [nodeId, exps] of exposuresByNode) {
    const intensities = exps.map((e) => e.intensity);
    const accIntensity = accumulatedIntensity(intensities);
    const uniqueSources = new Set(exps.map((e) => e.workHistoryId));
    const uniqueZones = [...new Set(exps.map((e) => e.zone))];
    const uniqueCategories = [...new Set(exps.map((e) => e.category))];

    accumulatedField.push({
      nodeId,
      nodeName: nodeNameById.get(nodeId) ?? "Unknown",
      accumulatedIntensity: Math.round(accIntensity * 1000) / 1000,
      sourceCount: uniqueSources.size,
      zones: uniqueZones,
      categories: uniqueCategories,
      transferable: uniqueSources.size >= 2,
    });
  }

  // Sort by accumulated intensity descending
  accumulatedField.sort((a, b) => b.accumulatedIntensity - a.accumulatedIntensity);

  return NextResponse.json({
    nodesCreated,
    nodesExisted: uniqueByNorm.size - nodesCreated,
    exposuresCreated,
    exposuresExisted,
    totalSources: exposuresBySource.size,
    field: accumulatedField,
    transferableCount: accumulatedField.filter((f) => f.transferable).length,
  });
}

/**
 * GET /api/skill-graph/edm/generate
 *
 * Returns the precomputed accumulated field for the current user.
 * Does NOT regenerate — just reads existing DiffusionExposure records.
 */
export async function GET(request: Request) {
  const userId = await getUserId();
  if (!userId)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const workHistoryId = searchParams.get("workHistoryId");
  const listSources = searchParams.get("sources") === "1";

  // ── Return available splat sources ──────────────────────────
  if (listSources) {
    const sources = await prisma.diffusionExposure.findMany({
      where: { userId },
      select: {
        workHistoryId: true,
        workHistory: { select: { title: true, company: true } },
      },
      distinct: ["workHistoryId"],
    });
    return NextResponse.json({
      sources: sources.map((s) => ({
        workHistoryId: s.workHistoryId,
        label: [s.workHistory.title, s.workHistory.company].filter(Boolean).join(" @ "),
      })),
    });
  }

  // ── Per-role splat view ─────────────────────────────────────
  if (workHistoryId) {
    const exposures = await prisma.diffusionExposure.findMany({
      where: { userId, workHistoryId },
      select: {
        skillNodeId: true,
        intensity: true,
        zone: true,
        category: true,
        skillNode: { select: { name: true, type: true } },
      },
    });

    const field = exposures.map((exp) => ({
      nodeId: exp.skillNodeId,
      nodeName: exp.skillNode.name,
      nodeType: exp.skillNode.type,
      intensity: exp.intensity,
      zone: exp.zone,
      category: exp.category,
    }));

    field.sort((a, b) => b.intensity - a.intensity);

    return NextResponse.json({ field, workHistoryId });
  }

  // ── Accumulated field (default) ─────────────────────────────
  const exposures = await prisma.diffusionExposure.findMany({
    where: { userId },
    select: {
      skillNodeId: true,
      intensity: true,
      zone: true,
      category: true,
      workHistoryId: true,
      skillNode: { select: { name: true, type: true } },
      workHistory: { select: { title: true, company: true } },
    },
  });

  if (exposures.length === 0) {
    return NextResponse.json({ field: [], totalSources: 0, transferableCount: 0 });
  }

  // Group by skillNodeId
  const byNode = new Map<
    string,
    { name: string; type: string; intensities: number[]; sources: Set<string>; zones: Set<string>; categories: Set<string> }
  >();

  for (const exp of exposures) {
    let entry = byNode.get(exp.skillNodeId);
    if (!entry) {
      entry = {
        name: exp.skillNode.name,
        type: exp.skillNode.type,
        intensities: [],
        sources: new Set(),
        zones: new Set(),
        categories: new Set(),
      };
      byNode.set(exp.skillNodeId, entry);
    }
    entry.intensities.push(exp.intensity);
    entry.sources.add(exp.workHistoryId);
    entry.zones.add(exp.zone);
    entry.categories.add(exp.category);
  }

  const field = Array.from(byNode.entries()).map(([nodeId, entry]) => ({
    nodeId,
    nodeName: entry.name,
    nodeType: entry.type,
    accumulatedIntensity:
      Math.round(accumulatedIntensity(entry.intensities) * 1000) / 1000,
    sourceCount: entry.sources.size,
    zones: [...entry.zones],
    categories: [...entry.categories],
    transferable: entry.sources.size >= 2,
  }));

  field.sort((a, b) => b.accumulatedIntensity - a.accumulatedIntensity);

  const uniqueSources = new Set(exposures.map((e) => e.workHistoryId));

  return NextResponse.json({
    field,
    totalSources: uniqueSources.size,
    transferableCount: field.filter((f) => f.transferable).length,
  });
}
