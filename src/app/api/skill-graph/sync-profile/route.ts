import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/activity";
import { NextResponse } from "next/server";
import { getUserId } from "@/lib/auth-utils";

/**
 * Normalise a skill/tool name so "Python", "python", "PYTHON" all resolve
 * to the same node.  Keeps the *first-seen* casing as the display name,
 * but uses the lower-cased key for dedup and DB unique lookups.
 */
function normKey(s: string): string {
  return s.trim().toLowerCase();
}

/**
 * POST /api/skill-graph/sync-profile
 *
 * Pulls structured data the user already entered — work history titles,
 * skills used/gained, current position tech-stack, equipment, certifications,
 * and learning-item skills — and upserts them into the skill graph with
 * evidence links back to the source artifacts.  No AI required.
 *
 * Returns new-vs-existing counts so the UI can show a delta toast.
 */
export async function POST() {
  const userId = await getUserId();
  if (!userId)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // ── 1. Gather all structured sources in parallel ──────────────
  const [workHistories, positions, certifications, learningItems, existingNodes] =
    await Promise.all([
      prisma.workHistory.findMany({
        where: { userId },
        select: {
          id: true,
          type: true,
          title: true,
          company: true,
          skillsUsed: true,
          skillsGained: true,
          major: true,
        },
      }),
      prisma.workHistory.findMany({
        where: { userId },
        select: {
          id: true,
          title: true,
          company: true,
          techStack: true,
          equipment: { select: { id: true, name: true, category: true } },
        },
      }),
      prisma.certification.findMany({
        where: { userId },
        select: { id: true, name: true },
      }),
      prisma.learningItem.findMany({
        where: { userId },
        select: { id: true, title: true, skills: true },
      }),
      // Pre-load existing nodes so we can track new-vs-existing
      prisma.skillNode.findMany({
        where: { userId },
        select: { id: true, name: true },
      }),
    ]);

  // Build a lookup of already-existing node names (normalised)
  const preExistingNames = new Set(existingNodes.map((n) => normKey(n.name)));

  // Collect { name, type, artifactType, artifactId, sourceId }
  type PendingSkill = {
    name: string;       // display name (first-seen casing)
    normName: string;   // normalised key for dedup
    type: string;
    artifactType: string;
    artifactId: string;
    sourceId?: string;   // workHistory id or position id (for occ→skill linking)
  };
  const pending: PendingSkill[] = [];

  // Occupation titles from work history ("job" type entries)
  type PendingOccupation = { title: string; company: string; sourceId: string };
  const pendingOccupations: PendingOccupation[] = [];

  // ── 2. Work history → occupations + skills ────────────────────
  for (const wh of workHistories) {
    if (wh.type === "job" && wh.title) {
      pendingOccupations.push({ title: wh.title, company: wh.company, sourceId: wh.id });
    }

    // Education major → domain skill
    if (wh.type === "school" && wh.major) {
      pending.push({
        name: wh.major,
        normName: normKey(wh.major),
        type: "domain",
        artifactType: "work_history",
        artifactId: wh.id,
        sourceId: wh.id,
      });
    }

    // skillsUsed / skillsGained are JSON string arrays
    for (const field of [wh.skillsUsed, wh.skillsGained]) {
      if (!field) continue;
      try {
        const arr: string[] = JSON.parse(field);
        for (const s of arr) {
          if (typeof s === "string" && s.trim()) {
            pending.push({
              name: s.trim(),
              normName: normKey(s),
              type: "technical",
              artifactType: "work_history",
              artifactId: wh.id,
              sourceId: wh.id,
            });
          }
        }
      } catch {
        /* non-JSON — skip */
      }
    }
  }

  // ── 3. Position → occupation + techStack + equipment ──
  for (const pos of positions) {
    if (pos.title) {
      pendingOccupations.push({ title: pos.title, company: pos.company, sourceId: pos.id });
    }

    // techStack is a comma- or newline-separated string
    if (pos.techStack) {
      const items = pos.techStack.split(/[,\n]+/).map((s) => s.trim()).filter(Boolean);
      for (const item of items) {
        pending.push({
          name: item,
          normName: normKey(item),
          type: "tool",
          artifactType: "work_history",
          artifactId: pos.id,
          sourceId: pos.id,
        });
      }
    }

    // Equipment → tool nodes
    for (const eq of pos.equipment) {
      pending.push({
        name: eq.name,
        normName: normKey(eq.name),
        type: "tool",
        artifactType: "work_history",
        artifactId: eq.id,
        sourceId: pos.id,
      });
    }
  }

  // ── 4. Certifications → domain skills ─────────────────────────
  for (const cert of certifications) {
    pending.push({
      name: cert.name,
      normName: normKey(cert.name),
      type: "domain",
      artifactType: "certification",
      artifactId: cert.id,
    });
  }

  // ── 5. Learning items → skills from the `skills` field ────────
  for (const li of learningItems) {
    if (!li.skills) continue;
    let arr: string[] = [];
    try {
      arr = JSON.parse(li.skills);
    } catch {
      arr = li.skills.split(/[,\n]+/).map((s) => s.trim()).filter(Boolean);
    }
    for (const s of arr) {
      if (typeof s === "string" && s.trim()) {
        pending.push({
          name: s.trim(),
          normName: normKey(s),
          type: "technical",
          artifactType: "learning_item",
          artifactId: li.id,
        });
      }
    }
  }

  if (pending.length === 0 && pendingOccupations.length === 0) {
    return NextResponse.json(
      {
        error:
          "No profile data found to sync. Add work history, positions, certifications, or learning items first.",
      },
      { status: 400 }
    );
  }

  // ── 6. Upsert skill nodes + evidence (with name normalisation) ─
  // nodeMap: normName → { id, displayName }
  const nodeMap = new Map<string, { id: string; displayName: string }>();
  let nodesNew = 0;
  let nodesExisted = 0;
  let evidenceNew = 0;
  let evidenceExisted = 0;

  // Choose first-seen display name per normKey
  const displayNames = new Map<string, string>();
  for (const p of pending) {
    if (!displayNames.has(p.normName)) displayNames.set(p.normName, p.name);
  }

  for (const p of pending) {
    const nk = p.normName;
    if (nodeMap.has(nk)) {
      // Node already processed this sync — just add evidence for a different artifact
      const existing = nodeMap.get(nk)!;
      try {
        await prisma.skillEvidence.upsert({
          where: {
            skillNodeId_artifactType_artifactId: {
              skillNodeId: existing.id,
              artifactType: p.artifactType,
              artifactId: p.artifactId,
            },
          },
          update: {},
          create: {
            userId,
            skillNodeId: existing.id,
            artifactType: p.artifactType,
            artifactId: p.artifactId,
            strength: 70,
          },
        });
        evidenceNew++;
      } catch {
        evidenceExisted++;
      }
      continue;
    }

    const display = displayNames.get(nk) ?? p.name;

    // Use the normalised name for the unique lookup to collapse casing variants
    // Try finding existing node by case-insensitive match first
    let node = existingNodes.find((n) => normKey(n.name) === nk);

    if (node) {
      // Already existed before this sync
      nodesExisted++;
    } else {
      // Create new node with display-cased name
      node = await prisma.skillNode.upsert({
        where: { userId_name: { userId, name: display } },
        update: {},
        create: {
          userId,
          name: display,
          type: p.type,
          source: "user",
        },
      });
      nodesNew++;
    }

    nodeMap.set(nk, { id: node.id, displayName: display });

    // Create evidence link
    try {
      await prisma.skillEvidence.upsert({
        where: {
          skillNodeId_artifactType_artifactId: {
            skillNodeId: node.id,
            artifactType: p.artifactType,
            artifactId: p.artifactId,
          },
        },
        update: {},
        create: {
          userId,
          skillNodeId: node.id,
          artifactType: p.artifactType,
          artifactId: p.artifactId,
          strength: 70,
        },
      });
      evidenceNew++;
    } catch {
      evidenceExisted++;
    }
  }

  // ── 7. Upsert occupation nodes from job titles ────────────────
  // Also track occupation id → sourceId for step 9 (occ→skill links)
  const preExistingOccCount = await prisma.occupation.count({ where: { userId } });
  let occupationsNew = 0;
  let occupationsExisted = 0;

  // occMap: syntheticSoc → { occupationId, sourceId }
  const occMap = new Map<string, { occupationId: string; sourceId: string }>();

  for (const occ of pendingOccupations) {
    const title = occ.title.trim();
    if (!title) continue;

    const syntheticSoc = `user-${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;

    try {
      const record = await prisma.occupation.upsert({
        where: { userId_socCode: { userId, socCode: syntheticSoc } },
        update: { title, metadata: JSON.stringify({ company: occ.company }) },
        create: {
          userId,
          socCode: syntheticSoc,
          title,
          cluster: "From Profile",
          source: "user",
          description: occ.company ? `Role at ${occ.company}` : null,
          metadata: JSON.stringify({ company: occ.company }),
        },
      });
      occMap.set(syntheticSoc, { occupationId: record.id, sourceId: occ.sourceId });
    } catch {
      /* duplicate — ignore */
    }
  }

  const postOccCount = await prisma.occupation.count({ where: { userId } });
  occupationsNew = postOccCount - preExistingOccCount;
  occupationsExisted = pendingOccupations.length - occupationsNew;

  // ── 8. Create peer edges between skills from the same artifact ─
  let edgesNew = 0;
  let edgesExisted = 0;

  // Group skills by artifactId
  const artifactGroups = new Map<string, string[]>();
  for (const p of pending) {
    const entry = nodeMap.get(p.normName);
    if (!entry) continue;
    const key = `${p.artifactType}:${p.artifactId}`;
    if (!artifactGroups.has(key)) artifactGroups.set(key, []);
    const group = artifactGroups.get(key)!;
    if (!group.includes(entry.id)) group.push(entry.id);
  }

  for (const [, nodeIds] of artifactGroups) {
    if (nodeIds.length < 2) continue;
    const capped = nodeIds.slice(0, 10);
    for (let i = 0; i < capped.length; i++) {
      for (let j = i + 1; j < capped.length; j++) {
        try {
          await prisma.skillEdge.upsert({
            where: {
              fromId_toId_type: {
                fromId: capped[i],
                toId: capped[j],
                type: "peer",
              },
            },
            update: { weight: { increment: 1 } },
            create: {
              fromId: capped[i],
              toId: capped[j],
              type: "peer",
              weight: 3,
              source: "user",
            },
          });
          edgesNew++;
        } catch {
          edgesExisted++;
        }
      }
    }
  }

  // ── 9. Link occupations → skills from the same source ─────────
  // For each occupation, find skills whose sourceId matches, and create
  // OccupationSkillRequirement records so the graph shows connections.
  let occSkillLinksNew = 0;

  // Build sourceId → [skillNodeId] lookup
  const sourceSkills = new Map<string, string[]>();
  for (const p of pending) {
    if (!p.sourceId) continue;
    const entry = nodeMap.get(p.normName);
    if (!entry) continue;
    if (!sourceSkills.has(p.sourceId)) sourceSkills.set(p.sourceId, []);
    const arr = sourceSkills.get(p.sourceId)!;
    if (!arr.includes(entry.id)) arr.push(entry.id);
  }

  for (const [, { occupationId, sourceId }] of occMap) {
    const skillIds = sourceSkills.get(sourceId);
    if (!skillIds) continue;

    for (const skillNodeId of skillIds) {
      try {
        await prisma.occupationSkillRequirement.upsert({
          where: {
            occupationId_skillNodeId: { occupationId, skillNodeId },
          },
          update: {},
          create: {
            occupationId,
            skillNodeId,
            importance: 60,
            level: 3.5,
            source: "user",
          },
        });
        occSkillLinksNew++;
      } catch {
        /* duplicate — ignore */
      }
    }
  }

  await logActivity(
    "skill_graph",
    userId,
    "sync_profile",
    `Synced ${nodesNew} new skills (${nodesExisted} existing), ${occupationsNew} new occupations, ${edgesNew} connections, ${occSkillLinksNew} occ→skill links from profile data`
  );

  return NextResponse.json({
    nodesNew,
    nodesExisted,
    occupationsNew,
    occupationsExisted,
    edgesNew,
    edgesExisted,
    evidenceNew,
    evidenceExisted,
    occSkillLinksNew,
  });
}
