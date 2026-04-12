import { prisma } from "@/lib/prisma";
import { getUserId } from "@/lib/auth-utils";
import { logActivity } from "@/lib/activity";
import { NextRequest, NextResponse } from "next/server";
import { getClusterForSoc } from "@/lib/onet";
import { readFileSync } from "fs";
import { join } from "path";

/**
 * POST /api/onet/ingest-csv
 *
 * Seed all ~1016 O*NET occupations from the local CSV file
 * (src/data/All_Occupations.csv) into the user's skill graph.
 *
 * This is a fast offline alternative to the API-based /api/onet/ingest route.
 * It creates Occupation records with code, title, cluster, and job zone metadata.
 * Skill/knowledge/ability details are NOT included (those require the API).
 *
 * Body (optional): { clusters?: string[] }
 */
export async function POST(req: NextRequest) {
  const userId = await getUserId();
  if (!userId)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let filterClusters: string[] | null = null;
  try {
    const body = await req.json().catch(() => ({}));
    if (body.clusters && Array.isArray(body.clusters)) {
      filterClusters = body.clusters;
    }
  } catch {
    // empty body is fine — ingest all
  }

  // Read and parse the CSV
  const csvPath = join(process.cwd(), "src", "data", "All_Occupations.csv");
  const raw = readFileSync(csvPath, "utf-8");
  const lines = raw.split("\n").filter((l) => l.trim());

  // Skip header: "Job Zone,Code,Occupation,Data-level"
  const rows = lines.slice(1);

  let ingested = 0;
  let skipped = 0;

  for (const line of rows) {
    // Handle quoted fields (occupation names can contain commas)
    const fields = parseCsvLine(line);
    if (fields.length < 4) {
      skipped++;
      continue;
    }

    const [jobZone, code, title, dataLevel] = fields;

    // Skip occupations without detailed data
    if (dataLevel.trim() !== "Y") {
      skipped++;
      continue;
    }

    // Validate SOC code format
    if (!/^\d{2}-\d{4}\.\d{2}$/.test(code.trim())) {
      skipped++;
      continue;
    }

    const socCode = code.trim();
    const cluster = getClusterForSoc(socCode);

    // Optionally filter by cluster
    if (filterClusters && !filterClusters.includes(cluster)) {
      skipped++;
      continue;
    }

    const metadata = JSON.stringify({
      jobZone: jobZone.trim(),
      dataLevel: dataLevel.trim(),
      source: "csv",
    });

    await prisma.occupation.upsert({
      where: { userId_socCode: { userId, socCode } },
      update: {
        title: title.trim(),
        cluster,
        metadata,
      },
      create: {
        userId,
        socCode,
        title: title.trim(),
        cluster,
        source: "onet",
        metadata,
      },
    });
    ingested++;
  }

  await logActivity(
    "onet",
    userId,
    "csv_ingest",
    `Seeded ${ingested} occupations from CSV (${skipped} skipped)`,
  );

  return NextResponse.json({
    ok: true,
    ingested,
    skipped,
    total: rows.length,
  });
}

/** Parse a single CSV line, respecting quoted fields with commas. */
function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === "," && !inQuotes) {
      fields.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  fields.push(current);
  return fields;
}
